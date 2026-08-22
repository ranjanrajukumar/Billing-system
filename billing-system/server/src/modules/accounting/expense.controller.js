import { Op, fn, col } from 'sequelize';
import {
  BankAccount, BankTransaction, Branch,
  Expense, ExpenseCategory, JournalEntry, sequelize, User,
} from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { withDateRange } from '../../utils/dateRange.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { postExpense, reverseEntry } from './accounting.service.js';
import { EXPENSE_CATEGORY_ACCOUNTS } from '../../config/chartOfAccounts.js';
import { cancelFor, requestApproval } from '../platform/approval.service.js';
import { recordCashMovement } from './cash.service.js';

/**
 * Running costs, booked against the location that incurred them so branch
 * profitability is real rather than a head-office guess.
 *
 * Recording an expense and paying it are separate steps: the first says money
 * is owed, the second says it left the till or the bank. Collapsing them would
 * make it impossible to see what has been committed but not yet paid.
 */

const INCLUDES = [
  { model: ExpenseCategory, attributes: ['id', 'name'] },
  { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
  { model: User, as: 'creator', attributes: ['id', 'name'] },
];

async function nextNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await Expense.count({
    where: { expenseNumber: { [Op.like]: `EXP-${year}-%` } },
    transaction,
  });
  return `EXP-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'expenseDate');
  if (req.query.status) where.status = req.query.status;
  if (req.query.categoryId) where.categoryId = req.query.categoryId;

  const { rows, count } = await Expense.findAndCountAll({
    where,
    include: INCLUDES,
    limit,
    offset,
    order: [['expenseDate', 'DESC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({
    where: { id: req.params.id, detstatus: false },
    include: INCLUDES,
  });
  if (!expense) return res.status(404).json({ message: 'Expense not found' });
  res.json(expense);
});

export const create = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const amount = Number(req.body.amount || 0);
    const taxAmount = Number(req.body.taxAmount || 0);
    if (!(amount > 0)) throw Object.assign(new Error('Expense amount must be greater than zero'), { status: 400 });

    const branchId = Number(req.body.branchId || req.branchId);
    const expense = await Expense.create({
      expenseNumber: req.body.expenseNumber || await nextNumber(transaction),
      expenseDate: req.body.expenseDate || new Date().toISOString().slice(0, 10),
      branchId,
      categoryId: req.body.categoryId || null,
      status: 'Pending Approval',
      amount,
      taxAmount,
      totalAmount: amount + taxAmount,
      paymentMode: req.body.paymentMode || null,
      payeeName: req.body.payeeName || null,
      referenceNo: req.body.referenceNo || null,
      createdBy: req.user.id,
      remarks: req.body.remarks || null,
      authadd: req.user.id,
    }, { transaction });

    const request = await requestApproval({
      documentType: 'Expense',
      documentId: expense.id,
      documentNumber: expense.expenseNumber,
      values: { amount, totalAmount: amount + taxAmount, grandTotal: amount + taxAmount },
      branchId,
      userId: req.user.id,
      transaction,
    });

    // Nothing to wait for when no rule applies.
    if (!request) {
      await expense.update({
        status: 'Approved', approvedBy: req.user.id, approvedAt: new Date(),
      }, { transaction });
    }

    return expense;
  });

  res.status(201).json(await Expense.findByPk(created.id, { include: INCLUDES }));
});

export const update = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!expense) return res.status(404).json({ message: 'Expense not found' });
  if (['Paid', 'Cancelled'].includes(expense.status)) {
    return res.status(409).json({ message: `A ${expense.status.toLowerCase()} expense cannot be edited` });
  }

  const amount = req.body.amount !== undefined ? Number(req.body.amount) : Number(expense.amount);
  const taxAmount = req.body.taxAmount !== undefined ? Number(req.body.taxAmount) : Number(expense.taxAmount);

  await expense.update({
    ...req.body,
    amount,
    taxAmount,
    totalAmount: amount + taxAmount,
    authlstedit: req.user.id,
  });
  res.json(await Expense.findByPk(expense.id, { include: INCLUDES }));
});

export const approve = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!expense) return res.status(404).json({ message: 'Expense not found' });
  if (!['Draft', 'Pending Approval'].includes(expense.status)) {
    return res.status(409).json({ message: `A ${expense.status.toLowerCase()} expense cannot be approved` });
  }

  await expense.update({
    status: 'Approved',
    approvedBy: req.user.id,
    approvedAt: new Date(),
    authlstedit: req.user.id,
  });
  res.json(expense);
});

export const reject = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const expense = await Expense.findOne({ where: { id: req.params.id, detstatus: false }, transaction });
    if (!expense) throw Object.assign(new Error('Expense not found'), { status: 404 });
    if (expense.status === 'Paid') {
      throw Object.assign(new Error('A paid expense cannot be rejected'), { status: 409 });
    }

    await cancelFor({ documentType: 'Expense', documentId: expense.id, userId: req.user.id, transaction });
    await expense.update({
      status: 'Rejected',
      remarks: req.body.reason || expense.remarks,
      authlstedit: req.user.id,
    }, { transaction });
    return expense;
  });
  res.json(result);
});

/**
 * Pays an approved expense out of a cash register or a bank account, moving
 * that balance and booking the entry in the same transaction.
 */
export const pay = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const expense = await Expense.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [ExpenseCategory],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!expense) throw Object.assign(new Error('Expense not found'), { status: 404 });
    if (expense.status === 'Paid') throw Object.assign(new Error('This expense is already paid'), { status: 409 });
    if (expense.status !== 'Approved') {
      throw Object.assign(new Error('Approve the expense before paying it'), { status: 409 });
    }

    const { cashRegisterId, bankAccountId } = req.body;
    if (!cashRegisterId && !bankAccountId) {
      throw Object.assign(new Error('Choose a cash register or a bank account to pay from'), { status: 400 });
    }

    const total = Number(expense.totalAmount);

    if (cashRegisterId) {
      await recordCashMovement({
        registerId: cashRegisterId,
        entryType: 'Expense',
        amountOut: total,
        referenceType: 'Expense',
        referenceId: expense.id,
        referenceNumber: expense.expenseNumber,
        partyName: expense.payeeName,
        notes: expense.remarks,
        transaction,
        userId: req.user.id,
      });
    } else {
      const account = await BankAccount.findOne({
        where: { id: bankAccountId, detstatus: false }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!account) throw Object.assign(new Error('Bank account not found'), { status: 404 });

      const balance = Number(account.currentBalance) - total;
      await BankTransaction.create({
        bankAccountId: account.id,
        branchId: expense.branchId,
        entryType: 'Expense',
        transactionDate: new Date(),
        amountIn: 0,
        amountOut: total,
        balance,
        referenceType: 'Expense',
        referenceId: expense.id,
        referenceNumber: expense.expenseNumber,
        partyName: expense.payeeName,
        instrumentNo: req.body.instrumentNo || null,
        notes: expense.remarks,
        authadd: req.user.id,
      }, { transaction });
      await account.update({ currentBalance: balance, authlstedit: req.user.id }, { transaction });
    }

    await expense.update({
      status: 'Paid',
      cashRegisterId: cashRegisterId || null,
      bankAccountId: bankAccountId || null,
      paymentMode: req.body.paymentMode || (cashRegisterId ? 'Cash' : 'Bank'),
      paidAt: new Date(),
      authlstedit: req.user.id,
    }, { transaction });

    await postExpense({
      expense,
      accountCode: EXPENSE_CATEGORY_ACCOUNTS[expense.ExpenseCategory?.name],
      transaction,
      userId: req.user.id,
    });

    return expense;
  });

  res.json(await Expense.findByPk(result.id, { include: INCLUDES }));
});

export const cancel = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const expense = await Expense.findOne({
      where: { id: req.params.id, detstatus: false }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!expense) throw Object.assign(new Error('Expense not found'), { status: 404 });

    // Money that already left has to come back before the record is retired.
    if (expense.status === 'Paid') {
      const total = Number(expense.totalAmount);
      if (expense.cashRegisterId) {
        await recordCashMovement({
          registerId: expense.cashRegisterId,
          entryType: 'Adjustment',
          amountIn: total,
          referenceType: 'Expense Cancellation',
          referenceId: expense.id,
          referenceNumber: expense.expenseNumber,
          notes: `Reversal of cancelled expense ${expense.expenseNumber}`,
          transaction,
          userId: req.user.id,
        });
      } else if (expense.bankAccountId) {
        const account = await BankAccount.findByPk(expense.bankAccountId, { transaction, lock: transaction.LOCK.UPDATE });
        if (account) {
          const balance = Number(account.currentBalance) + total;
          await BankTransaction.create({
            bankAccountId: account.id,
            branchId: expense.branchId,
            entryType: 'Adjustment',
            transactionDate: new Date(),
            amountIn: total,
            amountOut: 0,
            balance,
            referenceType: 'Expense Cancellation',
            referenceId: expense.id,
            referenceNumber: expense.expenseNumber,
            notes: `Reversal of cancelled expense ${expense.expenseNumber}`,
            authadd: req.user.id,
          }, { transaction });
          await account.update({ currentBalance: balance, authlstedit: req.user.id }, { transaction });
        }
      }

      const entry = await JournalEntry.findOne({
        where: { sourceType: 'Expense', sourceId: expense.id, status: 'Posted', detstatus: false },
        transaction,
      });
      if (entry) {
        await reverseEntry({
          entryId: entry.id, userId: req.user.id, transaction,
          narration: `Cancellation of expense ${expense.expenseNumber}`,
        });
      }
    }

    await cancelFor({ documentType: 'Expense', documentId: expense.id, userId: req.user.id, transaction });
    await expense.update({ status: 'Cancelled', authlstedit: req.user.id }, { transaction });
  });

  res.json({ message: 'Expense cancelled' });
});

/** Totals by category for a period, for the expense dashboard. */
export const summary = asyncHandler(async (req, res) => {
  const where = withDateRange(scopedWhere(req, { detstatus: false, status: { [Op.ne]: 'Cancelled' } }), req.query, 'expenseDate');

  const rows = await Expense.findAll({
    where,
    attributes: [
      'categoryId',
      [fn('SUM', col('total_amount')), 'total'],
      [fn('COUNT', col('Expense.id')), 'count'],
    ],
    include: [{ model: ExpenseCategory, attributes: ['name'] }],
    group: ['Expense.category_id', 'ExpenseCategory.id'],
    raw: true,
    nest: true,
  });

  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  res.json({ total, byCategory: rows });
});
