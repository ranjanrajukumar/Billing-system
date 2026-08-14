import { Op, fn, col } from 'sequelize';
import {
  BankAccount, BankTransaction, Branch, CashRegister, CashTransaction, sequelize,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { expectedBalance, recordCashMovement } from '../services/cash.service.js';

/**
 * Cash registers and bank accounts.
 *
 * A register is opened for a shift and closed against a physical count. The
 * difference between the ledger and the count is stored rather than corrected
 * away — a till that always balances to the paisa is a till nobody is counting.
 */

// ---- Cash registers ----

export const listRegisters = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = scopedWhere(req, { detstatus: false });
  if (req.query.status) where.status = req.query.status;

  const { rows, count } = await CashRegister.findAndCountAll({
    where,
    include: [{ model: Branch, attributes: ['id', 'branchName', 'locationType'] }],
    limit,
    offset,
    order: [['status', 'ASC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const getRegister = asyncHandler(async (req, res) => {
  const register = await CashRegister.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: Branch, attributes: ['id', 'branchName'] }],
  });
  if (!register) return res.status(404).json({ message: 'Cash register not found' });

  const expected = await expectedBalance(register.id);
  res.json({ ...register.toJSON(), expectedBalance: expected });
});

/** Opens a shift. One open register per location keeps the day unambiguous. */
export const openRegister = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const branchId = Number(req.body.branchId || req.branchId);

    const alreadyOpen = await CashRegister.findOne({
      where: { branchId, status: 'Open', detstatus: false }, transaction,
    });
    if (alreadyOpen) {
      throw Object.assign(
        new Error(`${alreadyOpen.registerName} is still open at this location. Close it before opening another.`),
        { status: 409 },
      );
    }

    const opening = Number(req.body.openingBalance || 0);
    const register = await CashRegister.create({
      registerName: req.body.registerName || `Counter ${new Date().toISOString().slice(0, 10)}`,
      branchId,
      status: 'Open',
      openedBy: req.user.id,
      openedAt: new Date(),
      openingBalance: opening,
      remarks: req.body.remarks || null,
      authadd: req.user.id,
    }, { transaction });

    if (opening > 0) {
      await CashTransaction.create({
        registerId: register.id,
        branchId,
        entryType: 'Opening',
        transactionDate: new Date(),
        amountIn: opening,
        amountOut: 0,
        balance: opening,
        notes: 'Opening float',
        authadd: req.user.id,
      }, { transaction });
    }

    return register;
  });

  res.status(201).json(created);
});

/**
 * Closes a shift against a counted figure. The variance is recorded on the
 * register and, when there is one, as a cash adjustment so the ledger and the
 * drawer agree from the next shift onwards.
 */
export const closeRegister = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const register = await CashRegister.findOne({
      where: { id: req.params.id, detstatus: false }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!register) throw Object.assign(new Error('Cash register not found'), { status: 404 });
    if (register.status === 'Closed') {
      throw Object.assign(new Error('This register is already closed'), { status: 409 });
    }

    const expected = await expectedBalance(register.id, transaction);
    const counted = Number(req.body.closingBalance ?? expected);
    const variance = counted - expected;

    if (Math.abs(variance) > 0.001) {
      await recordCashMovement({
        registerId: register.id,
        entryType: 'Adjustment',
        amountIn: variance > 0 ? variance : 0,
        amountOut: variance < 0 ? -variance : 0,
        referenceType: 'Register Close',
        referenceId: register.id,
        notes: `Counted ${counted.toFixed(2)} against an expected ${expected.toFixed(2)}`,
        transaction,
        userId: req.user.id,
      });
    }

    await register.update({
      status: 'Closed',
      closedBy: req.user.id,
      closedAt: new Date(),
      expectedBalance: expected,
      closingBalance: counted,
      variance,
      remarks: req.body.remarks || register.remarks,
      authlstedit: req.user.id,
    }, { transaction });

    return register;
  });

  res.json(result);
});

/** Cash in or out that is not tied to a sale — a float top-up, a bank deposit. */
export const addCashEntry = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const amount = Number(req.body.amount || 0);
    if (!(amount > 0)) throw Object.assign(new Error('Amount must be greater than zero'), { status: 400 });

    const isIn = ['Cash In', 'Customer Collection', 'Bank Withdrawal', 'Opening'].includes(req.body.entryType);
    return recordCashMovement({
      registerId: req.params.id,
      entryType: req.body.entryType || (isIn ? 'Cash In' : 'Cash Out'),
      amountIn: isIn ? amount : 0,
      amountOut: isIn ? 0 : amount,
      referenceNumber: req.body.referenceNumber || null,
      partyName: req.body.partyName || null,
      notes: req.body.notes || null,
      transaction,
      userId: req.user.id,
    });
  });

  res.status(201).json(created);
});

export const registerTransactions = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await CashTransaction.findAndCountAll({
    where: { registerId: req.params.id, detstatus: false },
    limit,
    offset,
    order: [['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

/** The day's cash position at a location: opening, movements by type, closing. */
export const dailyReconciliation = asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const branchId = req.query.branchId || req.branchScope || req.branchId;

  const registers = await CashRegister.findAll({
    where: {
      branchId,
      detstatus: false,
      openedAt: { [Op.lte]: new Date(`${date}T23:59:59`) },
    },
    order: [['id', 'DESC']],
  });

  const summary = [];
  for (const register of registers) {
    const rows = await CashTransaction.findAll({
      where: {
        registerId: register.id,
        detstatus: false,
        transactionDate: { [Op.between]: [new Date(`${date}T00:00:00`), new Date(`${date}T23:59:59`)] },
      },
      attributes: [
        'entryType',
        [fn('SUM', col('amount_in')), 'totalIn'],
        [fn('SUM', col('amount_out')), 'totalOut'],
      ],
      group: ['entry_type'],
      raw: true,
    });

    summary.push({
      registerId: register.id,
      registerName: register.registerName,
      status: register.status,
      openingBalance: Number(register.openingBalance || 0),
      closingBalance: register.closingBalance === null ? null : Number(register.closingBalance),
      variance: register.variance === null ? null : Number(register.variance),
      expected: await expectedBalance(register.id),
      byType: rows.map((row) => ({
        entryType: row.entryType,
        totalIn: Number(row.totalIn || 0),
        totalOut: Number(row.totalOut || 0),
      })),
      totalIn: rows.reduce((sum, r) => sum + Number(r.totalIn || 0), 0),
      totalOut: rows.reduce((sum, r) => sum + Number(r.totalOut || 0), 0),
    });
  }

  res.json({ date, branchId: Number(branchId), registers: summary });
});

// ---- Bank accounts ----

export const listBankAccounts = asyncHandler(async (req, res) => {
  const rows = await BankAccount.findAll({
    where: { detstatus: false },
    include: [{ model: Branch, attributes: ['id', 'branchName'] }],
    order: [['accountName', 'ASC']],
  });
  res.json(rows);
});

export const createBankAccount = asyncHandler(async (req, res) => {
  const opening = Number(req.body.openingBalance || 0);
  const account = await BankAccount.create({
    ...req.body,
    openingBalance: opening,
    currentBalance: opening,
    authadd: req.user.id,
  });
  res.status(201).json(account);
});

export const updateBankAccount = asyncHandler(async (req, res) => {
  const account = await BankAccount.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!account) return res.status(404).json({ message: 'Bank account not found' });

  // The balance is the sum of its transactions, not a field to be typed over.
  const { currentBalance, openingBalance, ...safe } = req.body;
  await account.update({ ...safe, authlstedit: req.user.id });
  res.json(account);
});

export const removeBankAccount = asyncHandler(async (req, res) => {
  const account = await BankAccount.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!account) return res.status(404).json({ message: 'Bank account not found' });

  const used = await BankTransaction.count({ where: { bankAccountId: account.id, detstatus: false } });
  if (used > 0) {
    return res.status(409).json({
      message: 'This account has transactions against it. Mark it inactive instead of deleting it.',
    });
  }

  await account.update({ detstatus: true, authdel: req.user.id, delondt: new Date() });
  res.status(204).send();
});

export const bankTransactions = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { bankAccountId: req.params.id, detstatus: false };
  if (req.query.reconciled !== undefined) where.isReconciled = req.query.reconciled === 'true';

  const { rows, count } = await BankTransaction.findAndCountAll({
    where, limit, offset, order: [['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

/** A deposit, withdrawal, charge or interest posting against an account. */
export const addBankEntry = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const account = await BankAccount.findOne({
      where: { id: req.params.id, detstatus: false }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!account) throw Object.assign(new Error('Bank account not found'), { status: 404 });

    const amount = Number(req.body.amount || 0);
    if (!(amount > 0)) throw Object.assign(new Error('Amount must be greater than zero'), { status: 400 });

    const isIn = ['Deposit', 'Customer Receipt', 'Transfer In', 'Interest'].includes(req.body.entryType);
    const balance = Number(account.currentBalance) + (isIn ? amount : -amount);

    const entry = await BankTransaction.create({
      bankAccountId: account.id,
      branchId: req.body.branchId || account.branchId || req.branchId,
      entryType: req.body.entryType || (isIn ? 'Deposit' : 'Withdrawal'),
      transactionDate: req.body.transactionDate || new Date(),
      amountIn: isIn ? amount : 0,
      amountOut: isIn ? 0 : amount,
      balance,
      instrumentType: req.body.instrumentType || null,
      instrumentNo: req.body.instrumentNo || null,
      partyName: req.body.partyName || null,
      notes: req.body.notes || null,
      authadd: req.user.id,
    }, { transaction });

    await account.update({ currentBalance: balance, authlstedit: req.user.id }, { transaction });
    return entry;
  });

  res.status(201).json(created);
});

export const reconcileBankEntry = asyncHandler(async (req, res) => {
  const entry = await BankTransaction.findOne({ where: { id: req.params.entryId, detstatus: false } });
  if (!entry) return res.status(404).json({ message: 'Bank transaction not found' });
  await entry.update({ isReconciled: req.body.reconciled !== false, authlstedit: req.user.id });
  res.json(entry);
});
