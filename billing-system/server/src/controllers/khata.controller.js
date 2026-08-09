import { Op, col, fn } from 'sequelize';
import { Customer, KhataEntry, Supplier } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { withDateRange } from '../utils/dateRange.js';
import { imageColumns } from '../utils/imageUpload.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * A khata belongs to the person who wrote it: staff see only their own entries.
 * Admins see everyone's, and may narrow to one user with `?userId=`.
 */
function ownerScope(req) {
  if (req.user?.role !== 'Admin') return { authadd: req.user?.id ?? -1 };
  return req.query.userId ? { authadd: Number(req.query.userId) } : {};
}

/** True when this user may touch an entry they did not write. */
const canReachOthers = (req) => req.user?.role === 'Admin';

// A positive balance means the party owes you; negative means you owe them.
const signed = (entry) => (entry.entryType === 'Gave' ? 1 : -1) * Number(entry.amount);

const partyModel = (partyType) => (partyType === 'Supplier' ? Supplier : Customer);
const partyName = (partyType, record) =>
  (partyType === 'Supplier' ? record?.supplierName : record?.customerName) || 'Unknown';

async function loadParty(partyType, partyId) {
  if (!['Customer', 'Supplier'].includes(partyType)) {
    throw Object.assign(new Error('Party type must be Customer or Supplier'), { status: 400 });
  }
  const record = await partyModel(partyType).findOne({ where: { id: partyId, detstatus: false } });
  if (!record) throw Object.assign(new Error(`${partyType} not found`), { status: 404 });
  return record;
}

/** Every party with a running khata balance, plus the overall net position. */
export const summary = asyncHandler(async (req, res) => {
  const rows = await KhataEntry.findAll({
    attributes: [
      'partyType', 'partyId', 'entryType',
      [fn('SUM', col('amount')), 'total'],
      [fn('MAX', col('entry_date')), 'lastEntry'],
      [fn('COUNT', col('id')), 'entries'],
    ],
    where: withDateRange({ detstatus: false, ...ownerScope(req) }, req.query, 'entryDate'),
    group: ['partyType', 'partyId', 'entryType'],
    raw: true,
  });

  const balances = new Map();
  for (const row of rows) {
    const key = `${row.partyType}:${row.partyId}`;
    const current = balances.get(key)
      || { partyType: row.partyType, partyId: Number(row.partyId), balance: 0, entries: 0, lastEntry: null };
    current.balance = round2(current.balance + (row.entryType === 'Gave' ? 1 : -1) * Number(row.total));
    current.entries += Number(row.entries);
    if (!current.lastEntry || row.lastEntry > current.lastEntry) current.lastEntry = row.lastEntry;
    balances.set(key, current);
  }

  const list = [...balances.values()].filter((row) => Math.abs(row.balance) > 0.009);
  const customerIds = list.filter((r) => r.partyType === 'Customer').map((r) => r.partyId);
  const supplierIds = list.filter((r) => r.partyType === 'Supplier').map((r) => r.partyId);

  const [customers, suppliers] = await Promise.all([
    customerIds.length ? Customer.findAll({ where: { id: customerIds } }) : [],
    supplierIds.length ? Supplier.findAll({ where: { id: supplierIds } }) : [],
  ]);
  const names = new Map([
    ...customers.map((c) => [`Customer:${c.id}`, { name: c.customerName, mobile: c.mobileNumber }]),
    ...suppliers.map((s) => [`Supplier:${s.id}`, { name: s.supplierName, mobile: s.mobileNumber }]),
  ]);

  const search = String(req.query.search || '').toLowerCase();
  const parties = list
    .map((row) => {
      const info = names.get(`${row.partyType}:${row.partyId}`) || {};
      return { ...row, partyName: info.name || 'Unknown', mobileNumber: info.mobile || '' };
    })
    .filter((row) => (!req.query.partyType || row.partyType === req.query.partyType))
    .filter((row) => !search
      || row.partyName.toLowerCase().includes(search)
      || String(row.mobileNumber).includes(search))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  res.json({
    parties,
    totals: {
      youWillGet: round2(parties.filter((p) => p.balance > 0).reduce((sum, p) => sum + p.balance, 0)),
      youWillGive: round2(Math.abs(parties.filter((p) => p.balance < 0).reduce((sum, p) => sum + p.balance, 0))),
      parties: parties.length,
    },
  });
});

/** One party's entries, oldest first, with a running balance. */
export const partyLedger = asyncHandler(async (req, res) => {
  const { partyType, partyId } = req.params;
  const party = await loadParty(partyType, partyId);

  const entries = await KhataEntry.findAll({
    where: withDateRange({ partyType, partyId, detstatus: false, ...ownerScope(req) }, req.query, 'entryDate'),
    order: [['entryDate', 'ASC'], ['id', 'ASC']],
  });

  let balance = 0;
  const ledger = entries.map((entry) => {
    balance = round2(balance + signed(entry));
    return { ...entry.toJSON(), balance };
  });

  const now = today();
  res.json({
    party: {
      partyType,
      partyId: Number(partyId),
      partyName: partyName(partyType, party),
      mobileNumber: party.mobileNumber || '',
    },
    ledger,
    summary: {
      balance,
      gave: round2(entries.filter((e) => e.entryType === 'Gave').reduce((s, e) => s + Number(e.amount), 0)),
      got: round2(entries.filter((e) => e.entryType === 'Got').reduce((s, e) => s + Number(e.amount), 0)),
      entries: entries.length,
      overdue: entries.some((e) => e.dueDate && e.dueDate < now && balance > 0),
    },
  });
});

export const createEntry = asyncHandler(async (req, res) => {
  await loadParty(req.body.partyType, req.body.partyId);

  const entry = await KhataEntry.create({
    partyType: req.body.partyType,
    partyId: req.body.partyId,
    entryDate: req.body.entryDate || today(),
    entryType: req.body.entryType,
    amount: round2(req.body.amount),
    note: req.body.note,
    dueDate: req.body.dueDate || null,
    authadd: req.user?.id,
    ...imageColumns(req.file, 'attachment'),
  });

  res.status(201).json(await KhataEntry.findByPk(entry.id));
});

export const updateEntry = asyncHandler(async (req, res) => {
  const entry = await KhataEntry.findOne({
    // Scoped rather than checked afterwards, so another user's entry is simply
    // not found instead of leaking that it exists.
    where: { id: req.params.id, detstatus: false, ...(canReachOthers(req) ? {} : { authadd: req.user?.id }) },
  });
  if (!entry) return res.status(404).json({ message: 'Entry not found' });

  const payload = { authlstedit: req.user?.id, ...imageColumns(req.file, 'attachment') };
  for (const field of ['entryDate', 'entryType', 'amount', 'note', 'dueDate']) {
    if (req.body[field] !== undefined) payload[field] = req.body[field];
  }
  if (payload.amount !== undefined) payload.amount = round2(payload.amount);

  await entry.update(payload);
  res.json(await KhataEntry.findByPk(entry.id));
});

export const removeEntry = asyncHandler(async (req, res) => {
  const entry = await KhataEntry.findOne({
    where: { id: req.params.id, detstatus: false, ...(canReachOthers(req) ? {} : { authadd: req.user?.id }) },
  });
  if (!entry) return res.status(404).json({ message: 'Entry not found' });
  await entry.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  res.status(204).send();
});

/** Parties that can be added to a khata, whether or not they have entries yet. */
export const parties = asyncHandler(async (_req, res) => {
  const [customers, suppliers] = await Promise.all([
    Customer.findAll({ where: { detstatus: false }, attributes: ['id', 'customerName', 'mobileNumber'], order: [['customerName', 'ASC']] }),
    Supplier.findAll({ where: { detstatus: false }, attributes: ['id', 'supplierName', 'mobileNumber'], order: [['supplierName', 'ASC']] }),
  ]);

  res.json({
    customers: customers.map((c) => ({ partyType: 'Customer', partyId: c.id, partyName: c.customerName, mobileNumber: c.mobileNumber })),
    suppliers: suppliers.map((s) => ({ partyType: 'Supplier', partyId: s.id, partyName: s.supplierName, mobileNumber: s.mobileNumber })),
  });
});

export const attachment = asyncHandler(async (req, res) => {
  // Bill photos follow the same privacy as the entry itself, so this is served
  // through the authenticated API rather than the public /media routes.
  const entry = await KhataEntry.unscoped().findOne({
    where: { id: req.params.id, detstatus: false, ...(canReachOthers(req) ? {} : { authadd: req.user?.id }) },
    attributes: ['attachmentData', 'attachmentMimeType'],
  });
  if (!entry?.attachmentData) return res.status(404).json({ message: 'Attachment not found' });
  res.setHeader('Content-Type', entry.attachmentMimeType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(entry.attachmentData);
});
