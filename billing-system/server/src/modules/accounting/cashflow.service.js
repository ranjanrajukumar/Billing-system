import { Op, fn, col, literal } from 'sequelize';
import {
  BankAccount, BankTransaction, CashRegister, CashTransaction,
  Expense, Invoice, Payment, Purchase,
} from '../../models/index.js';

/**
 * Cash flow: what actually came in and went out over a period.
 *
 * Built from the documents rather than from the accounting journal, so it works
 * in Basic mode where there is no double entry at all. A shopkeeper who never
 * opens a journal still needs to know whether more money came in this month
 * than went out — that question should not require bookkeeping.
 *
 * This is a *cash* view, not an accrual one: a credit sale appears when the
 * customer pays, not when the invoice was raised. That is the honest answer to
 * "how much money moved", and it is deliberately different from the profit
 * figure on the P&L.
 */

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

function periodWhere(field, from, to) {
  if (!from && !to) return {};
  const range = {};
  if (from) range[Op.gte] = from;
  if (to) range[Op.lte] = field.includes('At') || field.includes('Date') ? `${to} 23:59:59` : to;
  return { [field]: range };
}

/**
 * Money in and out for a period, grouped by where it came from and went to.
 * `branchId` narrows it to one location; omit for the whole business.
 */
export async function cashFlowSummary({ from, to, branchId = null } = {}) {
  const branchFilter = branchId ? { branchId } : {};

  // ---- In: money customers actually paid ----
  const receipts = await Payment.findAll({
    where: { detstatus: false, ...periodWhere('paidAt', from, to) },
    attributes: ['paymentMethod', [fn('SUM', col('Payment.amount')), 'total']],
    include: [{
      model: Invoice,
      attributes: [],
      required: true,
      where: { detstatus: false, ...branchFilter },
    }],
    group: ['Payment.payment_method'],
    raw: true,
  });

  // ---- Out: what was paid to suppliers on their bills ----
  const supplierPayments = await Purchase.findAll({
    where: {
      detstatus: false,
      status: { [Op.ne]: 'Cancelled' },
      paidAmount: { [Op.gt]: 0 },
      ...branchFilter,
      ...periodWhere('purchaseDate', from, to),
    },
    attributes: [[fn('SUM', col('paid_amount')), 'total']],
    raw: true,
  });

  // ---- Out: running costs actually paid ----
  const expenses = await Expense.findAll({
    where: {
      detstatus: false,
      status: 'Paid',
      ...branchFilter,
      ...periodWhere('expenseDate', from, to),
    },
    attributes: ['categoryId', [fn('SUM', col('total_amount')), 'total']],
    include: [{ association: Expense.associations.ExpenseCategory, attributes: ['name'] }],
    group: ['Expense.category_id', 'ExpenseCategory.id'],
    raw: true,
    nest: true,
  });

  const inflow = receipts.map((row) => ({
    source: `Customer receipts — ${row.paymentMethod || 'Cash'}`,
    amount: money(row.total),
  }));

  const outflow = [];
  const supplierTotal = money(supplierPayments[0]?.total);
  if (supplierTotal > 0) outflow.push({ source: 'Payments to suppliers', amount: supplierTotal });
  for (const row of expenses) {
    outflow.push({
      source: `Expense — ${row.ExpenseCategory?.name || 'Uncategorised'}`,
      amount: money(row.total),
    });
  }

  const totalIn = money(inflow.reduce((sum, r) => sum + r.amount, 0));
  const totalOut = money(outflow.reduce((sum, r) => sum + r.amount, 0));

  return {
    from: from || null,
    to: to || null,
    branchId: branchId ? Number(branchId) : null,
    inflow: inflow.sort((a, b) => b.amount - a.amount),
    outflow: outflow.sort((a, b) => b.amount - a.amount),
    totalIn,
    totalOut,
    netFlow: money(totalIn - totalOut),
  };
}

/**
 * Where the money is sitting right now: cash in open tills plus bank balances.
 * Distinct from the flow above — this is the position, that was the movement.
 */
export async function cashPosition({ branchId = null } = {}) {
  const registerWhere = { detstatus: false, status: 'Open' };
  if (branchId) registerWhere.branchId = branchId;

  const registers = await CashRegister.findAll({ where: registerWhere });

  const tills = [];
  for (const register of registers) {
    const last = await CashTransaction.findOne({
      where: { registerId: register.id, detstatus: false },
      order: [['id', 'DESC']],
    });
    tills.push({
      registerId: register.id,
      registerName: register.registerName,
      branchId: register.branchId,
      balance: money(last ? last.balance : register.openingBalance),
    });
  }

  const bankWhere = { detstatus: false, isActive: true };
  if (branchId) bankWhere[Op.or] = [{ branchId }, { branchId: null }];
  const banks = await BankAccount.findAll({ where: bankWhere });

  const cashOnHand = money(tills.reduce((sum, t) => sum + t.balance, 0));
  const inBank = money(banks.reduce((sum, b) => sum + Number(b.currentBalance || 0), 0));

  return {
    tills,
    banks: banks.map((b) => ({
      id: b.id,
      accountName: b.accountName,
      bankName: b.bankName,
      balance: money(b.currentBalance),
    })),
    cashOnHand,
    inBank,
    total: money(cashOnHand + inBank),
  };
}

/**
 * Day-by-day movement, for a chart and for spotting the day something odd
 * happened. Kept to the till and bank ledgers, which is where actual cash
 * movement is recorded.
 */
export async function dailyCashMovement({ from, to, branchId = null } = {}) {
  const where = { detstatus: false, ...periodWhere('transactionDate', from, to) };
  if (branchId) where.branchId = branchId;

  const cash = await CashTransaction.findAll({
    where,
    attributes: [
      [fn('DATE', col('transaction_date')), 'day'],
      [fn('SUM', col('amount_in')), 'inAmount'],
      [fn('SUM', col('amount_out')), 'outAmount'],
    ],
    group: [fn('DATE', col('transaction_date'))],
    order: [[literal('day'), 'ASC']],
    raw: true,
  });

  const bankWhere = { detstatus: false, ...periodWhere('transactionDate', from, to) };
  const bank = await BankTransaction.findAll({
    where: bankWhere,
    attributes: [
      [fn('DATE', col('transaction_date')), 'day'],
      [fn('SUM', col('amount_in')), 'inAmount'],
      [fn('SUM', col('amount_out')), 'outAmount'],
    ],
    group: [fn('DATE', col('transaction_date'))],
    order: [[literal('day'), 'ASC']],
    raw: true,
  });

  // Merged so a day appears once with both sides of the business on it.
  const byDay = new Map();
  const add = (rows, kind) => {
    for (const row of rows) {
      const day = String(row.day);
      const entry = byDay.get(day) || { day, cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 };
      entry[kind === 'cash' ? 'cashIn' : 'bankIn'] += Number(row.inAmount || 0);
      entry[kind === 'cash' ? 'cashOut' : 'bankOut'] += Number(row.outAmount || 0);
      byDay.set(day, entry);
    }
  };
  add(cash, 'cash');
  add(bank, 'bank');

  return [...byDay.values()]
    .map((entry) => ({
      ...entry,
      cashIn: money(entry.cashIn),
      cashOut: money(entry.cashOut),
      bankIn: money(entry.bankIn),
      bankOut: money(entry.bankOut),
      net: money(entry.cashIn + entry.bankIn - entry.cashOut - entry.bankOut),
    }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}
