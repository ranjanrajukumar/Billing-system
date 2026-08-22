import { Op } from 'sequelize';
import {
  ChartOfAccount, JournalEntry, JournalEntryLine, sequelize, User,
} from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { withDateRange } from '../../utils/dateRange.js';
import {
  balanceSheet, generalLedger, postEntry, profitAndLoss, rebuildBalances,
  reverseEntry, seedChartOfAccounts, trialBalance,
} from './accounting.service.js';

/**
 * Accounting screens. All the arithmetic lives in the accounting service —
 * these handlers only shape requests and responses, so there is exactly one
 * place where a debit becomes a balance.
 */

// ---- Chart of accounts ----

export const listAccounts = asyncHandler(async (req, res) => {
  const where = { detstatus: false };
  if (req.query.accountType) where.accountType = req.query.accountType;
  if (req.query.postable === 'true') where.isGroup = false;
  if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };

  const rows = await ChartOfAccount.findAll({ where, order: [['code', 'ASC']] });
  res.json(rows);
});

/** The chart as a tree, which is how it is read on screen. */
export const accountTree = asyncHandler(async (_req, res) => {
  const rows = await ChartOfAccount.findAll({ where: { detstatus: false }, order: [['code', 'ASC']] });
  const byId = new Map(rows.map((row) => [row.id, { ...row.toJSON(), children: [] }]));

  const roots = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId).children.push(node);
    else roots.push(node);
  }
  res.json(roots);
});

export const createAccount = asyncHandler(async (req, res) => {
  const existing = await ChartOfAccount.findOne({ where: { code: req.body.code, detstatus: false } });
  if (existing) return res.status(409).json({ message: `Account code ${req.body.code} is already in use` });

  const account = await ChartOfAccount.create({
    ...req.body,
    // A user-created account is never a system one, whatever the payload says.
    isSystem: false,
    currentBalance: Number(req.body.openingBalance || 0),
    authadd: req.user.id,
  });
  res.status(201).json(account);
});

export const updateAccount = asyncHandler(async (req, res) => {
  const account = await ChartOfAccount.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!account) return res.status(404).json({ message: 'Account not found' });

  // The posting service finds system accounts by code and relies on their type,
  // so those two stay fixed even when the name is changed to suit the business.
  const { code, accountType, normalBalance, currentBalance, isSystem, ...safe } = req.body;
  const payload = account.isSystem ? safe : { ...safe, code, accountType, normalBalance };

  await account.update({ ...payload, authlstedit: req.user.id });
  res.json(account);
});

export const removeAccount = asyncHandler(async (req, res) => {
  const account = await ChartOfAccount.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!account) return res.status(404).json({ message: 'Account not found' });
  if (account.isSystem) {
    return res.status(409).json({ message: 'This account is used by automatic postings and cannot be deleted' });
  }

  const used = await JournalEntryLine.count({ where: { accountId: account.id, detstatus: false } });
  if (used > 0) {
    return res.status(409).json({ message: 'This account has entries against it. Mark it inactive instead.' });
  }

  await account.update({ detstatus: true, authdel: req.user.id, delondt: new Date() });
  res.status(204).send();
});

export const seedAccounts = asyncHandler(async (_req, res) => {
  const seeded = await seedChartOfAccounts();
  res.json({ message: `Chart of accounts ready (${seeded.size} accounts).` });
});

// ---- Journal entries ----

export const listEntries = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange({ detstatus: false }, req.query, 'entryDate');
  if (req.query.status) where.status = req.query.status;
  if (req.query.sourceType) where.sourceType = req.query.sourceType;
  if (req.branchScope) where.branchId = req.branchScope;

  const { rows, count } = await JournalEntry.findAndCountAll({
    where,
    distinct: true,
    include: [
      { model: JournalEntryLine, include: [{ model: ChartOfAccount, attributes: ['id', 'code', 'name'] }] },
      { model: User, as: 'poster', attributes: ['id', 'name'] },
    ],
    limit,
    offset,
    order: [['entryDate', 'DESC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const getEntry = asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: JournalEntryLine, include: [{ model: ChartOfAccount, attributes: ['id', 'code', 'name', 'accountType'] }] },
      { model: User, as: 'poster', attributes: ['id', 'name'] },
    ],
  });
  if (!entry) return res.status(404).json({ message: 'Journal entry not found' });
  res.json(entry);
});

/** A hand-written voucher. The service refuses it unless it balances. */
export const createEntry = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => postEntry({
    date: req.body.entryDate,
    lines: req.body.lines || [],
    narration: req.body.narration,
    sourceType: 'Manual',
    branchId: req.body.branchId || req.branchId,
    userId: req.user.id,
    status: req.body.status === 'Draft' ? 'Draft' : 'Posted',
    transaction,
  }));

  if (!created) return res.status(400).json({ message: 'A journal entry needs at least two lines with amounts' });
  res.status(201).json(await JournalEntry.findByPk(created.id, { include: [JournalEntryLine] }));
});

export const reverse = asyncHandler(async (req, res) => {
  const reversal = await sequelize.transaction(async (transaction) => reverseEntry({
    entryId: req.params.id,
    date: req.body.date,
    narration: req.body.narration,
    userId: req.user.id,
    transaction,
  }));
  res.json(reversal);
});

// ---- Statements ----

export const getGeneralLedger = asyncHandler(async (req, res) => {
  res.json(await generalLedger({
    accountId: req.params.accountId,
    from: req.query.from,
    to: req.query.to,
    branchId: req.query.branchId || req.branchScope || null,
  }));
});

export const getTrialBalance = asyncHandler(async (req, res) => {
  res.json(await trialBalance({
    from: req.query.from,
    to: req.query.to,
    branchId: req.query.branchId || req.branchScope || null,
  }));
});

export const getProfitAndLoss = asyncHandler(async (req, res) => {
  res.json(await profitAndLoss({
    from: req.query.from,
    to: req.query.to,
    branchId: req.query.branchId || req.branchScope || null,
  }));
});

export const getBalanceSheet = asyncHandler(async (req, res) => {
  res.json(await balanceSheet({
    asOn: req.query.asOn || req.query.to,
    branchId: req.query.branchId || req.branchScope || null,
  }));
});

/** Repair tool for imported data; recomputes balances from the posted lines. */
export const rebuild = asyncHandler(async (req, res) => {
  const count = await rebuildBalances(req.user.id);
  res.json({ message: `Recomputed ${count} account balances from posted entries.` });
});
