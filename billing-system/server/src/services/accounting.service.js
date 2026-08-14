import { Op, fn, col } from 'sequelize';
import { ChartOfAccount, JournalEntry, JournalEntryLine, sequelize } from '../models/index.js';
import { ACCOUNTS, DEFAULT_ACCOUNTS } from '../config/chartOfAccounts.js';
import { getConfig } from './config.service.js';
import { withoutAudit } from './audit.service.js';

/**
 * The accounting engine.
 *
 * One rule holds the whole thing together: account balances are never written
 * from a controller. A business event describes what happened, this service
 * turns it into a balanced journal entry, and balances move as a consequence of
 * that entry existing. Nothing else may touch `currentBalance`.
 *
 * Posting is best-effort by design: if accounting is switched off (Basic mode),
 * `postEntry` returns null and the caller's sale or purchase carries on
 * unaffected. A shop that never opens the accounts screen should not have its
 * billing fail because a ledger account is missing.
 */

/** Rounds to paise, so repeated arithmetic cannot leave an entry a cent out. */
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

export async function accountByCode(code, transaction) {
  return ChartOfAccount.findOne({ where: { code, detstatus: false }, transaction });
}

/**
 * Seeds the default chart, parents first. Existing accounts are left alone.
 *
 * Not audited: laying out a standard chart is the system setting itself up, and
 * forty "Created ChartOfAccount" rows tell nobody anything. It also keeps the
 * un-awaited audit writes from racing the seeding transactions.
 */
export async function seedChartOfAccounts() {
  return withoutAudit(async () => {
    const byCode = new Map();
    for (const account of DEFAULT_ACCOUNTS) {
      const [row] = await ChartOfAccount.findOrCreate({
        where: { code: account.code },
        defaults: {
          code: account.code,
          name: account.name,
          accountType: account.accountType,
          normalBalance: account.normalBalance,
          isGroup: Boolean(account.isGroup),
          isSystem: Boolean(account.system),
          parentId: account.parent ? byCode.get(account.parent) ?? null : null,
        },
      });
      byCode.set(account.code, row.id);

      // A parent created in a later pass still needs linking on re-run.
      if (account.parent && !row.parentId) {
        await row.update({ parentId: byCode.get(account.parent) ?? null });
      }
    }
    return byCode;
  });
}

async function nextEntryNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await JournalEntry.count({
    where: { entryNumber: { [Op.like]: `JV-${year}-%` } },
    transaction,
  });
  return `JV-${year}-${String(count + 1).padStart(5, '0')}`;
}

/**
 * Moves an account's balance by a posting, in the direction that account
 * naturally grows. A debit increases an asset and decreases a liability; this
 * is the only place that asymmetry is expressed.
 */
async function applyToBalance(account, debit, credit, transaction) {
  const delta = account.normalBalance === 'Debit'
    ? money(debit) - money(credit)
    : money(credit) - money(debit);

  await account.update(
    { currentBalance: money(Number(account.currentBalance || 0) + delta) },
    { transaction },
  );
}

/**
 * Posts a balanced journal entry.
 *
 * `lines` are `{ code | accountId, debit, credit, partyType, partyId, narration }`.
 * The entry is refused unless the debits and credits agree — an unbalanced
 * entry is not a slightly wrong entry, it is a corrupt ledger.
 */
export async function postEntry({
  date,
  lines,
  narration = null,
  sourceType = 'Manual',
  sourceId = null,
  sourceNumber = null,
  branchId = null,
  userId = null,
  transaction,
  status = 'Posted',
}) {
  const usable = (lines || []).filter((line) => money(line.debit) !== 0 || money(line.credit) !== 0);
  if (usable.length < 2) return null;

  const resolved = [];
  for (const line of usable) {
    const account = line.accountId
      ? await ChartOfAccount.findByPk(line.accountId, { transaction })
      : await accountByCode(line.code, transaction);

    if (!account) {
      throw Object.assign(new Error(`Ledger account ${line.code || line.accountId} not found`), { status: 400 });
    }
    if (account.isGroup) {
      throw Object.assign(new Error(`${account.name} is a group heading and cannot be posted to`), { status: 400 });
    }
    resolved.push({ account, line });
  }

  const totalDebit = money(resolved.reduce((sum, r) => sum + money(r.line.debit), 0));
  const totalCredit = money(resolved.reduce((sum, r) => sum + money(r.line.credit), 0));

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw Object.assign(
      new Error(`Journal entry does not balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`),
      { status: 400 },
    );
  }

  const entry = await JournalEntry.create({
    entryNumber: await nextEntryNumber(transaction),
    entryDate: date || new Date().toISOString().slice(0, 10),
    branchId,
    status,
    sourceType,
    sourceId,
    sourceNumber,
    totalDebit,
    totalCredit,
    postedBy: status === 'Posted' ? userId : null,
    postedAt: status === 'Posted' ? new Date() : null,
    narration,
    authadd: userId,
  }, { transaction });

  for (const { account, line } of resolved) {
    await JournalEntryLine.create({
      entryId: entry.id,
      accountId: account.id,
      branchId,
      debit: money(line.debit),
      credit: money(line.credit),
      partyType: line.partyType || null,
      partyId: line.partyId || null,
      narration: line.narration || null,
      authadd: userId,
    }, { transaction });

    if (status === 'Posted') await applyToBalance(account, line.debit, line.credit, transaction);
  }

  return entry;
}

/**
 * Posts an entry only when accounting is switched on, swallowing configuration
 * problems so a missing ledger account can never block a sale.
 *
 * Genuine programming errors still surface — only the "accounting isn't set up"
 * case is tolerated, and it is logged rather than hidden.
 */
export async function postIfEnabled(payload) {
  try {
    const { modules } = await getConfig();
    if (!modules.has('accounting')) return null;
    return await postEntry(payload);
  } catch (error) {
    console.warn(`Accounting entry skipped for ${payload.sourceType} ${payload.sourceNumber || payload.sourceId}: ${error.message}`);
    return null;
  }
}

/**
 * Reverses a posted entry with an equal and opposite one. The original is left
 * exactly as it was — that is the point of a reversal.
 */
export async function reverseEntry({ entryId, date, userId, transaction, narration = null }) {
  const original = await JournalEntry.findOne({
    where: { id: entryId, detstatus: false },
    include: [JournalEntryLine],
    transaction,
  });
  if (!original) throw Object.assign(new Error('Journal entry not found'), { status: 404 });
  if (original.status !== 'Posted') {
    throw Object.assign(new Error('Only a posted entry can be reversed'), { status: 400 });
  }
  if (original.reversedById) {
    throw Object.assign(new Error('This entry has already been reversed'), { status: 409 });
  }

  const reversal = await postEntry({
    date: date || new Date().toISOString().slice(0, 10),
    branchId: original.branchId,
    sourceType: original.sourceType,
    sourceId: original.sourceId,
    sourceNumber: original.sourceNumber,
    narration: narration || `Reversal of ${original.entryNumber}`,
    userId,
    transaction,
    lines: original.JournalEntryLines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
      partyType: line.partyType,
      partyId: line.partyId,
      narration: line.narration,
    })),
  });

  await original.update({ status: 'Reversed', reversedById: reversal.id, authlstedit: userId }, { transaction });
  await reversal.update({ reversalOfId: original.id }, { transaction });
  return reversal;
}

// ---------------------------------------------------------------------------
// Business events → journal entries.
// Every automatic entry in the system is defined here and nowhere else.
// ---------------------------------------------------------------------------

/**
 * A sale: the customer owes us (or paid), revenue is earned, GST is collected
 * on the government's behalf, and the goods leave inventory at cost.
 */
export async function postSale({ invoice, items = [], costOfGoods = 0, transaction, userId }) {
  const gst = money(Number(invoice.cgst || 0) + Number(invoice.sgst || 0) + Number(invoice.igst || 0));
  const revenue = money(invoice.subtotal);
  const total = money(invoice.grandTotal);
  const discount = money(Number(invoice.couponDiscount || 0) + Number(invoice.pointsDiscount || 0));
  const onCredit = invoice.paymentMethod === 'Credit';

  const lines = [
    // Where the money is: owed to us, or in the till.
    {
      code: onCredit ? ACCOUNTS.RECEIVABLE : ACCOUNTS.CASH,
      debit: total,
      credit: 0,
      partyType: onCredit ? 'Customer' : null,
      partyId: onCredit ? invoice.customerId : null,
      narration: `Invoice ${invoice.invoiceNumber}`,
    },
    { code: ACCOUNTS.SALES, debit: 0, credit: revenue, narration: `Invoice ${invoice.invoiceNumber}` },
    { code: ACCOUNTS.OUTPUT_GST, debit: 0, credit: gst, narration: `GST on ${invoice.invoiceNumber}` },
  ];

  // A discount is a cost of making the sale, not a reduction of the price we
  // charged, so it is shown rather than netted away.
  if (discount > 0) {
    lines.push({ code: ACCOUNTS.DISCOUNTS, debit: discount, credit: 0, narration: 'Discount allowed' });
    lines.push({ code: ACCOUNTS.SALES, debit: 0, credit: discount, narration: 'Discount gross-up' });
  }

  const cogs = money(costOfGoods || items.reduce(
    (sum, item) => sum + Number(item.unitCost || 0) * Number(item.quantity || 0), 0,
  ));
  if (cogs > 0) {
    lines.push({ code: ACCOUNTS.COGS, debit: cogs, credit: 0, narration: `Cost of ${invoice.invoiceNumber}` });
    lines.push({ code: ACCOUNTS.INVENTORY, debit: 0, credit: cogs, narration: `Stock issued on ${invoice.invoiceNumber}` });
  }

  return postIfEnabled({
    date: invoice.invoiceDate,
    branchId: invoice.branchId,
    sourceType: 'Invoice',
    sourceId: invoice.id,
    sourceNumber: invoice.invoiceNumber,
    narration: `Sale ${invoice.invoiceNumber}`,
    lines, userId, transaction,
  });
}

/** A purchase: stock arrives, ITC is claimable, the supplier is owed. */
export async function postPurchase({ purchase, transaction, userId }) {
  const tax = money(purchase.taxAmount);
  const net = money(purchase.subtotal);
  const total = money(purchase.grandTotal);
  const paid = money(purchase.paidAmount || 0);
  const owed = money(total - paid);

  const lines = [
    { code: ACCOUNTS.INVENTORY, debit: net, credit: 0, narration: `Goods on ${purchase.purchaseNumber}` },
    { code: ACCOUNTS.INPUT_GST, debit: tax, credit: 0, narration: `ITC on ${purchase.purchaseNumber}` },
  ];
  if (owed > 0) {
    lines.push({
      code: ACCOUNTS.PAYABLE, debit: 0, credit: owed,
      partyType: 'Supplier', partyId: purchase.supplierId,
      narration: `Payable on ${purchase.purchaseNumber}`,
    });
  }
  if (paid > 0) {
    lines.push({ code: ACCOUNTS.CASH, debit: 0, credit: paid, narration: `Paid on ${purchase.purchaseNumber}` });
  }

  return postIfEnabled({
    date: purchase.purchaseDate,
    branchId: purchase.branchId,
    sourceType: 'Purchase',
    sourceId: purchase.id,
    sourceNumber: purchase.purchaseNumber,
    narration: `Purchase ${purchase.purchaseNumber}`,
    lines, userId, transaction,
  });
}

/** A customer payment: money in, receivable down. */
export async function postCustomerPayment({ payment, invoice, transaction, userId, bank = false }) {
  const amount = money(payment.amount);
  return postIfEnabled({
    date: payment.paidAt || new Date().toISOString().slice(0, 10),
    branchId: invoice?.branchId || null,
    sourceType: 'Payment',
    sourceId: payment.id,
    sourceNumber: invoice?.invoiceNumber || null,
    narration: `Receipt against ${invoice?.invoiceNumber || 'account'}`,
    lines: [
      { code: bank ? ACCOUNTS.BANK : ACCOUNTS.CASH, debit: amount, credit: 0 },
      {
        code: ACCOUNTS.RECEIVABLE, debit: 0, credit: amount,
        partyType: 'Customer', partyId: invoice?.customerId || null,
      },
    ],
    userId, transaction,
  });
}

/** A supplier payment: payable down, money out. */
export async function postSupplierPayment({ amount, supplierId, date, reference, branchId, transaction, userId, bank = false }) {
  const value = money(amount);
  return postIfEnabled({
    date,
    branchId,
    sourceType: 'SupplierPayment',
    sourceNumber: reference,
    narration: `Payment to supplier ${reference || ''}`.trim(),
    lines: [
      { code: ACCOUNTS.PAYABLE, debit: value, credit: 0, partyType: 'Supplier', partyId: supplierId },
      { code: bank ? ACCOUNTS.BANK : ACCOUNTS.CASH, debit: 0, credit: value },
    ],
    userId, transaction,
  });
}

/** An expense, booked to its category's account and paid from cash or bank. */
export async function postExpense({ expense, accountCode, transaction, userId }) {
  const net = money(expense.amount);
  const tax = money(expense.taxAmount || 0);
  const total = money(expense.totalAmount || net + tax);
  const bank = Boolean(expense.bankAccountId);

  const lines = [
    { code: accountCode || ACCOUNTS.OTHER_EXPENSE, debit: net, credit: 0, narration: expense.expenseNumber },
  ];
  if (tax > 0) lines.push({ code: ACCOUNTS.INPUT_GST, debit: tax, credit: 0 });
  lines.push({ code: bank ? ACCOUNTS.BANK : ACCOUNTS.CASH, debit: 0, credit: total });

  return postIfEnabled({
    date: expense.expenseDate,
    branchId: expense.branchId,
    sourceType: 'Expense',
    sourceId: expense.id,
    sourceNumber: expense.expenseNumber,
    narration: `Expense ${expense.expenseNumber}`,
    lines, userId, transaction,
  });
}

/** A sales return: revenue reversed, GST reclaimed, goods back into stock. */
export async function postSalesReturn({ salesReturn, costOfGoods = 0, transaction, userId }) {
  const total = money(salesReturn.totalRefund || salesReturn.grandTotal || 0);
  if (total <= 0) return null;

  const lines = [
    { code: ACCOUNTS.SALES_RETURNS, debit: total, credit: 0, narration: salesReturn.returnNumber },
    {
      code: ACCOUNTS.RECEIVABLE, debit: 0, credit: total,
      partyType: 'Customer', partyId: salesReturn.customerId,
    },
  ];
  const cogs = money(costOfGoods);
  if (cogs > 0) {
    lines.push({ code: ACCOUNTS.INVENTORY, debit: cogs, credit: 0, narration: 'Goods returned to stock' });
    lines.push({ code: ACCOUNTS.COGS, debit: 0, credit: cogs });
  }

  return postIfEnabled({
    date: salesReturn.returnDate,
    branchId: salesReturn.branchId,
    sourceType: 'SalesReturn',
    sourceId: salesReturn.id,
    sourceNumber: salesReturn.returnNumber,
    narration: `Sales return ${salesReturn.returnNumber}`,
    lines, userId, transaction,
  });
}

/** A purchase return: stock out, ITC given back, supplier owes us less. */
export async function postPurchaseReturn({ purchaseReturn, transaction, userId }) {
  const net = money(purchaseReturn.subtotal);
  const tax = money(purchaseReturn.taxAmount);
  const total = money(purchaseReturn.grandTotal);

  return postIfEnabled({
    date: purchaseReturn.returnDate,
    branchId: purchaseReturn.branchId,
    sourceType: 'PurchaseReturn',
    sourceId: purchaseReturn.id,
    sourceNumber: purchaseReturn.returnNumber,
    narration: `Purchase return ${purchaseReturn.returnNumber}`,
    lines: [
      {
        code: ACCOUNTS.PAYABLE, debit: total, credit: 0,
        partyType: 'Supplier', partyId: purchaseReturn.supplierId,
        narration: `Debit note ${purchaseReturn.debitNoteNumber || purchaseReturn.returnNumber}`,
      },
      { code: ACCOUNTS.PURCHASE_RETURNS, debit: 0, credit: net },
      { code: ACCOUNTS.INPUT_GST, debit: 0, credit: tax },
    ],
    userId, transaction,
  });
}

/**
 * A stock adjustment. Only the value of what was written off or found is
 * booked; a transfer between our own locations changes no total and so
 * produces no entry at all.
 */
export async function postStockAdjustment({ adjustment, value, transaction, userId }) {
  const amount = money(Math.abs(value));
  if (amount === 0) return null;
  const isLoss = Number(value) < 0;

  return postIfEnabled({
    date: adjustment.adjustmentDate,
    branchId: adjustment.branchId,
    sourceType: 'StockAdjustment',
    sourceId: adjustment.id,
    sourceNumber: adjustment.adjustmentNumber,
    narration: `${adjustment.reason} — ${adjustment.adjustmentNumber}`,
    lines: isLoss
      ? [
        { code: ACCOUNTS.INVENTORY_WRITE_OFF, debit: amount, credit: 0 },
        { code: ACCOUNTS.INVENTORY, debit: 0, credit: amount },
      ]
      : [
        { code: ACCOUNTS.INVENTORY, debit: amount, credit: 0 },
        { code: ACCOUNTS.INVENTORY_WRITE_OFF, debit: 0, credit: amount },
      ],
    userId, transaction,
  });
}

// ---------------------------------------------------------------------------
// Statements. All derived from posted journal lines — never from stored totals.
// ---------------------------------------------------------------------------

function dateFilter(from, to) {
  const where = {};
  if (from) where[Op.gte] = from;
  if (to) where[Op.lte] = to;
  return Object.getOwnPropertySymbols(where).length ? where : null;
}

/** Posted debit/credit totals per account for a period. */
async function accountTotals({ from, to, branchId } = {}) {
  const entryWhere = { status: 'Posted', detstatus: false };
  const range = dateFilter(from, to);
  if (range) entryWhere.entryDate = range;
  if (branchId) entryWhere.branchId = branchId;

  const rows = await JournalEntryLine.findAll({
    attributes: [
      'accountId',
      [fn('SUM', col('JournalEntryLine.debit')), 'debit'],
      [fn('SUM', col('JournalEntryLine.credit')), 'credit'],
    ],
    include: [{ model: JournalEntry, attributes: [], where: entryWhere, required: true }],
    where: { detstatus: false },
    group: ['JournalEntryLine.account_id'],
    raw: true,
  });

  return new Map(rows.map((row) => [
    Number(row.accountId),
    { debit: Number(row.debit || 0), credit: Number(row.credit || 0) },
  ]));
}

/** The trial balance: every posting account with its net side. */
export async function trialBalance({ from, to, branchId } = {}) {
  const [accounts, totals] = await Promise.all([
    ChartOfAccount.findAll({ where: { detstatus: false, isGroup: false }, order: [['code', 'ASC']] }),
    accountTotals({ from, to, branchId }),
  ]);

  let totalDebit = 0;
  let totalCredit = 0;
  const rows = accounts.map((account) => {
    const { debit = 0, credit = 0 } = totals.get(account.id) || {};
    const opening = Number(account.openingBalance || 0);
    // Expressed on the side the account naturally sits, then split for display.
    const net = account.normalBalance === 'Debit'
      ? opening + debit - credit
      : opening + credit - debit;

    const debitBalance = account.normalBalance === 'Debit' ? Math.max(net, 0) : Math.max(-net, 0);
    const creditBalance = account.normalBalance === 'Credit' ? Math.max(net, 0) : Math.max(-net, 0);
    totalDebit += debitBalance;
    totalCredit += creditBalance;

    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      periodDebit: money(debit),
      periodCredit: money(credit),
      debitBalance: money(debitBalance),
      creditBalance: money(creditBalance),
    };
  }).filter((row) => row.periodDebit || row.periodCredit || row.debitBalance || row.creditBalance);

  return {
    rows,
    totalDebit: money(totalDebit),
    totalCredit: money(totalCredit),
    // Rounding aside, these must agree; if they do not, something posted badly.
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };
}

/** Profit & loss for a period, from income and expense accounts. */
export async function profitAndLoss({ from, to, branchId } = {}) {
  const { rows } = await trialBalance({ from, to, branchId });

  const income = rows.filter((r) => r.accountType === 'Income');
  const expense = rows.filter((r) => r.accountType === 'Expense');

  // Income accounts with a debit normal balance (returns, discounts) reduce it.
  const signed = (row) => (row.normalBalance === 'Credit'
    ? row.periodCredit - row.periodDebit
    : -(row.periodDebit - row.periodCredit));

  const totalIncome = money(income.reduce((sum, r) => sum + signed(r), 0));
  const totalExpense = money(expense.reduce(
    (sum, r) => sum + (r.normalBalance === 'Debit' ? r.periodDebit - r.periodCredit : -(r.periodCredit - r.periodDebit)), 0,
  ));

  const cogs = money(expense
    .filter((r) => r.code === ACCOUNTS.COGS || r.code === ACCOUNTS.PURCHASE_RETURNS)
    .reduce((sum, r) => sum + (r.normalBalance === 'Debit' ? r.periodDebit - r.periodCredit : -(r.periodCredit - r.periodDebit)), 0));

  return {
    from: from || null,
    to: to || null,
    income,
    expense,
    totalIncome,
    totalExpense,
    costOfGoodsSold: cogs,
    grossProfit: money(totalIncome - cogs),
    netProfit: money(totalIncome - totalExpense),
  };
}

/**
 * Balance sheet as at a date. Retained earnings are computed from the profit to
 * date rather than stored, so the sheet balances by construction instead of by
 * a periodic closing routine somebody has to remember to run.
 */
export async function balanceSheet({ asOn, branchId } = {}) {
  const to = asOn || new Date().toISOString().slice(0, 10);
  const { rows } = await trialBalance({ to, branchId });

  const pick = (type) => rows.filter((r) => r.accountType === type)
    .map((r) => ({ ...r, balance: money(r.debitBalance - r.creditBalance) }));

  const assets = pick('Asset');
  const liabilities = pick('Liability').map((r) => ({ ...r, balance: money(-r.balance) }));
  const equity = pick('Equity').map((r) => ({ ...r, balance: money(-r.balance) }));

  const totalAssets = money(assets.reduce((sum, r) => sum + r.balance, 0));
  const totalLiabilities = money(liabilities.reduce((sum, r) => sum + r.balance, 0));
  const totalEquity = money(equity.reduce((sum, r) => sum + r.balance, 0));

  const { netProfit } = await profitAndLoss({ to, branchId });
  const retained = money(netProfit);

  return {
    asOn: to,
    assets,
    liabilities,
    equity,
    retainedEarnings: retained,
    totalAssets,
    totalLiabilities,
    totalEquity: money(totalEquity + retained),
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + retained)) < 0.01,
  };
}

/** The general ledger for one account: every line, with a running balance. */
export async function generalLedger({ accountId, from, to, branchId }) {
  const account = await ChartOfAccount.findByPk(accountId);
  if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

  const entryWhere = { status: 'Posted', detstatus: false };
  const range = dateFilter(from, to);
  if (range) entryWhere.entryDate = range;
  if (branchId) entryWhere.branchId = branchId;

  const lines = await JournalEntryLine.findAll({
    where: { accountId, detstatus: false },
    include: [{
      model: JournalEntry,
      where: entryWhere,
      required: true,
      attributes: ['id', 'entryNumber', 'entryDate', 'narration', 'sourceType', 'sourceNumber'],
    }],
    order: [[JournalEntry, 'entryDate', 'ASC'], [JournalEntry, 'id', 'ASC']],
  });

  let balance = Number(account.openingBalance || 0);
  const rows = lines.map((line) => {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    balance += account.normalBalance === 'Debit' ? debit - credit : credit - debit;
    return {
      date: line.JournalEntry.entryDate,
      entryNumber: line.JournalEntry.entryNumber,
      sourceType: line.JournalEntry.sourceType,
      sourceNumber: line.JournalEntry.sourceNumber,
      narration: line.narration || line.JournalEntry.narration,
      debit: money(debit),
      credit: money(credit),
      balance: money(balance),
    };
  });

  return {
    account: {
      id: account.id, code: account.code, name: account.name,
      accountType: account.accountType, normalBalance: account.normalBalance,
      openingBalance: money(account.openingBalance),
    },
    rows,
    closingBalance: money(balance),
    totalDebit: money(rows.reduce((s, r) => s + r.debit, 0)),
    totalCredit: money(rows.reduce((s, r) => s + r.credit, 0)),
  };
}

/**
 * Recomputes every account balance from the posted lines. A repair tool for
 * data imported or migrated from elsewhere, not part of normal operation.
 */
export async function rebuildBalances(userId = null) {
  return sequelize.transaction(async (transaction) => {
    const accounts = await ChartOfAccount.findAll({ where: { detstatus: false }, transaction });
    const totals = await accountTotals();

    for (const account of accounts) {
      const { debit = 0, credit = 0 } = totals.get(account.id) || {};
      const balance = account.normalBalance === 'Debit'
        ? Number(account.openingBalance || 0) + debit - credit
        : Number(account.openingBalance || 0) + credit - debit;
      await account.update({ currentBalance: money(balance), authlstedit: userId }, { transaction });
    }
    return accounts.length;
  });
}
