import { Op } from 'sequelize';
import { BranchStock, Product, StockMovement, StockOwner } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { clearOwnerCache, houseOwnerId } from './stockOwner.service.js';

/**
 * The clients whose goods this warehouse holds.
 *
 * The house row is here too, so a screen can show "our stock" alongside the
 * clients without special-casing it — but it is protected: it cannot be
 * deleted, renamed out of existence, or turned into an ordinary client, because
 * every stock row in the database defaults to it.
 */

/** Fields a caller may set. Never spread the body — `isHouse` is not theirs. */
function ownerFields(body = {}) {
  const allowed = [
    'ownerName', 'ownerCode', 'contactPerson', 'mobileNumber', 'email', 'gstNumber',
    'address', 'storageRatePerUnitPerDay', 'handlingRateInbound', 'handlingRateOutbound',
    'freeStorageDays', 'isActive', 'notes',
  ];
  const out = {};
  for (const key of allowed) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  if (out.ownerCode !== undefined) out.ownerCode = String(out.ownerCode).trim().toUpperCase();
  return out;
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };

  if (req.query.search) {
    where[Op.or] = [
      { ownerName: { [Op.like]: `%${req.query.search}%` } },
      { ownerCode: { [Op.like]: `%${req.query.search}%` } },
    ];
  }
  if (req.query.active === 'true') where.isActive = true;
  // The house is not a client; a client list should not have to filter it out.
  if (req.query.clientsOnly === 'true') where.isHouse = false;

  const { rows, count } = await StockOwner.findAndCountAll({
    where,
    limit,
    offset,
    // House first, then clients alphabetically.
    order: [['isHouse', 'DESC'], ['ownerName', 'ASC']],
  });

  res.json(paged(rows, count, page, limit));
});

export const get = asyncHandler(async (req, res) => {
  const owner = await StockOwner.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!owner) return res.status(404).json({ message: 'Stock owner not found' });
  res.json(owner);
});

export const create = asyncHandler(async (req, res) => {
  const fields = ownerFields(req.body);
  if (!fields.ownerName) return res.status(400).json({ message: 'Client name is required' });
  if (!fields.ownerCode) return res.status(400).json({ message: 'A short client code is required' });

  const clash = await StockOwner.findOne({ where: { ownerCode: fields.ownerCode, detstatus: false } });
  if (clash) return res.status(409).json({ message: `Code ${fields.ownerCode} is already in use` });

  const owner = await StockOwner.create({
    ...fields,
    // Only the migration creates the house. A client that could declare itself
    // the house would silently take over every unattributed movement.
    isHouse: false,
    authadd: req.user.id,
  });
  clearOwnerCache();
  res.status(201).json(owner);
});

export const update = asyncHandler(async (req, res) => {
  const owner = await StockOwner.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!owner) return res.status(404).json({ message: 'Stock owner not found' });

  const fields = ownerFields(req.body);

  if (owner.isHouse) {
    // The house may be renamed — "Own Stock" is not every business's word for
    // it — but it must stay active and keep its code, since both are relied on.
    delete fields.isActive;
    delete fields.ownerCode;
  }

  if (fields.ownerCode && fields.ownerCode !== owner.ownerCode) {
    const clash = await StockOwner.findOne({
      where: { ownerCode: fields.ownerCode, detstatus: false, id: { [Op.ne]: owner.id } },
    });
    if (clash) return res.status(409).json({ message: `Code ${fields.ownerCode} is already in use` });
  }

  await owner.update({ ...fields, authlstedit: req.user.id });
  clearOwnerCache();
  res.json(owner);
});

export const remove = asyncHandler(async (req, res) => {
  const owner = await StockOwner.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!owner) return res.status(404).json({ message: 'Stock owner not found' });

  if (owner.isHouse) {
    return res.status(409).json({
      message: 'This is your own stock and cannot be removed',
    });
  }

  // Goods still in the building belong to somebody. Removing the client would
  // orphan them — the quantity would stay on the shelf with no one to return it
  // to and no one to bill.
  const holding = await BranchStock.sum('stock', { where: { ownerId: owner.id } });
  if (Number(holding || 0) > 0) {
    return res.status(409).json({
      message: `${owner.ownerName} still has ${holding} unit(s) in store — dispatch or write them off first`,
      remaining: Number(holding),
    });
  }

  await owner.update({ detstatus: true, authdel: req.user.id, delondt: new Date() });
  clearOwnerCache();
  res.status(204).send();
});

/**
 * What one client has with us: what is on the shelf now, and what has moved.
 *
 * This is the statement a 3PL sends its client, and the basis of their bill —
 * storage is charged on what is held, handling on what came in and went out.
 */
export const holdings = asyncHandler(async (req, res) => {
  const owner = await StockOwner.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!owner) return res.status(404).json({ message: 'Stock owner not found' });

  const rows = await BranchStock.findAll({
    where: { ownerId: owner.id, stock: { [Op.ne]: 0 } },
    include: [{
      model: Product,
      attributes: ['id', 'productName', 'sku', 'primaryUnit', 'purchasePrice'],
      where: { detstatus: false },
    }],
  });

  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59`) : null;

  const movementWhere = { ownerId: owner.id, detstatus: false };
  if (from || to) {
    movementWhere.transactionDate = {};
    if (from) movementWhere.transactionDate[Op.gte] = from;
    if (to) movementWhere.transactionDate[Op.lte] = to;
  }

  const movements = await StockMovement.findAll({
    where: movementWhere,
    attributes: ['quantityIn', 'quantityOut'],
    raw: true,
  });

  const handledIn = movements.reduce((sum, m) => sum + Number(m.quantityIn || 0), 0);
  const handledOut = movements.reduce((sum, m) => sum + Number(m.quantityOut || 0), 0);

  res.json({
    owner: {
      id: owner.id, ownerName: owner.ownerName, ownerCode: owner.ownerCode, isHouse: owner.isHouse,
    },
    // Valued at cost for the client's information. It is deliberately not
    // added to the company's own valuation anywhere — these are not our goods.
    lines: rows.map((row) => ({
      productId: row.productId,
      productName: row.Product?.productName,
      sku: row.Product?.sku,
      unit: row.Product?.primaryUnit,
      branchId: row.branchId,
      quantity: Number(row.stock),
      valueAtCost: Number(row.stock) * Number(row.Product?.purchasePrice || 0),
    })),
    totalUnitsHeld: rows.reduce((sum, row) => sum + Number(row.stock), 0),
    handledIn,
    handledOut,
    period: { from: req.query.from || null, to: req.query.to || null },
  });
});

/** The house id, so a client can tell "ours" from "theirs" without guessing. */
export const house = asyncHandler(async (_req, res) => {
  res.json({ houseOwnerId: await houseOwnerId() });
});
