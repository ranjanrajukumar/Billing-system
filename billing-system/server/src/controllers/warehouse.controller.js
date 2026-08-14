import { Op, fn, col } from 'sequelize';
import {
  Branch, BranchStock, Product, ProductSerial, sequelize, StockMovement, WarehouseBin,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { clearBranchCache } from '../middleware/branchContext.js';
import { stockValuation } from '../services/stock.service.js';

/**
 * Warehouses and their internal structure.
 *
 * A warehouse is a location of type 'Warehouse' in the same table as branches,
 * so it inherits stock, transfers and movements without a second code path.
 * What is genuinely different is the zone/rack/bin tree — which is why that is
 * the only thing this controller adds beyond location CRUD.
 */

const LOCATION_ATTRS = ['id', 'branchName', 'branchCode', 'locationType', 'city', 'state', 'address', 'phone', 'isActive', 'canSell', 'parentId'];

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  // Defaults to warehouses; pass ?locationType=Branch or 'all' for the rest.
  if (req.query.locationType !== 'all') where.locationType = req.query.locationType || 'Warehouse';

  const { rows, count } = await Branch.findAndCountAll({
    where, attributes: LOCATION_ATTRS, limit, offset, order: [['branchName', 'ASC']],
  });

  const totals = await BranchStock.findAll({
    attributes: ['branchId', [fn('SUM', col('stock')), 'totalStock']],
    where: { branchId: rows.map((r) => r.id) },
    group: ['branch_id'],
    raw: true,
  });
  const stockById = new Map(totals.map((row) => [Number(row.branchId), Number(row.totalStock || 0)]));

  res.json(paged(
    rows.map((row) => ({ ...row.toJSON(), totalStock: stockById.get(row.id) || 0 })),
    count, page, limit,
  ));
});

export const getOne = asyncHandler(async (req, res) => {
  const location = await Branch.findOne({
    where: { id: req.params.id, detstatus: false },
    attributes: LOCATION_ATTRS,
  });
  if (!location) return res.status(404).json({ message: 'Location not found' });

  const bins = await WarehouseBin.findAll({
    where: { branchId: location.id, detstatus: false },
    order: [['level', 'ASC'], ['code', 'ASC']],
  });

  res.json({ ...location.toJSON(), bins: buildTree(bins) });
});

export const create = asyncHandler(async (req, res) => {
  const location = await Branch.create({
    ...req.body,
    locationType: req.body.locationType || 'Warehouse',
    // A warehouse stores rather than sells, so it stays out of billing pickers
    // unless the business explicitly says otherwise.
    canSell: req.body.canSell ?? (req.body.locationType === 'Branch'),
    // Only a branch can be the company's default selling location.
    isDefault: false,
    authadd: req.user.id,
  });
  clearBranchCache();
  res.status(201).json(location);
});

export const update = asyncHandler(async (req, res) => {
  const location = await Branch.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!location) return res.status(404).json({ message: 'Location not found' });

  // Turning a location that holds stock into another kind would silently move
  // that stock between the branch and warehouse views.
  if (req.body.locationType && req.body.locationType !== location.locationType) {
    const held = await BranchStock.sum('stock', { where: { branchId: location.id } });
    if (Number(held || 0) > 0) {
      return res.status(409).json({
        message: `This location holds ${held} units. Move the stock out before changing its type.`,
      });
    }
  }

  await location.update({ ...req.body, authlstedit: req.user.id });
  clearBranchCache();
  res.json(location);
});

export const remove = asyncHandler(async (req, res) => {
  const location = await Branch.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!location) return res.status(404).json({ message: 'Location not found' });
  if (location.isDefault) {
    return res.status(400).json({ message: 'The default location cannot be deleted' });
  }

  const held = await BranchStock.sum('stock', { where: { branchId: location.id } });
  if (Number(held || 0) > 0) {
    return res.status(409).json({
      message: `This location still holds ${held} units of stock. Transfer it out before deleting.`,
    });
  }

  await location.update({ detstatus: true, authdel: req.user.id, delondt: new Date() });
  clearBranchCache();
  res.status(204).send();
});

/** What a location is holding, product by product. */
export const contents = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { branchId: req.params.id };
  if (req.query.nonZero !== 'false') where.stock = { [Op.ne]: 0 };

  const { rows, count } = await BranchStock.findAndCountAll({
    where,
    include: [{
      model: Product,
      attributes: ['id', 'productName', 'sku', 'barcode', 'primaryUnit', 'purchasePrice', 'sellingPrice', 'lowStockThreshold'],
      where: { detstatus: false },
    }],
    limit,
    offset,
    order: [['stock', 'DESC']],
  });

  res.json(paged(rows, count, page, limit));
});

/** Valuation of one location's stock, at cost and at sale price. */
export const valuation = asyncHandler(async (req, res) => {
  res.json(await stockValuation(req.params.id));
});

// ---- Zone / rack / shelf / bin ----

function buildTree(rows) {
  const byId = new Map(rows.map((row) => [row.id, { ...row.toJSON(), children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId).children.push(node);
    else roots.push(node);
  }
  return roots;
}

export const listBins = asyncHandler(async (req, res) => {
  const rows = await WarehouseBin.findAll({
    where: { branchId: req.params.id, detstatus: false },
    order: [['level', 'ASC'], ['code', 'ASC']],
  });
  res.json(req.query.flat === 'true' ? rows : buildTree(rows));
});

export const createBin = asyncHandler(async (req, res) => {
  const location = await Branch.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!location) return res.status(404).json({ message: 'Location not found' });

  const bin = await WarehouseBin.create({
    ...req.body,
    branchId: location.id,
    authadd: req.user.id,
  });
  res.status(201).json(bin);
});

export const updateBin = asyncHandler(async (req, res) => {
  const bin = await WarehouseBin.findOne({ where: { id: req.params.binId, detstatus: false } });
  if (!bin) return res.status(404).json({ message: 'Bin not found' });
  await bin.update({ ...req.body, authlstedit: req.user.id });
  res.json(bin);
});

export const removeBin = asyncHandler(async (req, res) => {
  const bin = await WarehouseBin.findOne({ where: { id: req.params.binId, detstatus: false } });
  if (!bin) return res.status(404).json({ message: 'Bin not found' });

  const children = await WarehouseBin.count({ where: { parentId: bin.id, detstatus: false } });
  if (children > 0) {
    return res.status(409).json({ message: 'Remove the sub-locations inside this one first' });
  }

  await bin.update({ detstatus: true, authdel: req.user.id, delondt: new Date() });
  res.status(204).send();
});

// ---- Serial numbers ----

/** Every tracked unit, filterable by product, location, status or number. */
export const listSerials = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.productId) where.productId = req.query.productId;
  if (req.query.status) where.status = req.query.status;
  if (req.query.branchId) where.branchId = req.query.branchId;
  if (req.query.search) where.serialNumber = { [Op.like]: `%${req.query.search}%` };

  const { rows, count } = await ProductSerial.findAndCountAll({
    where,
    include: [
      { model: Product, attributes: ['id', 'productName', 'sku'] },
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
    ],
    limit,
    offset,
    order: [['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

/** One unit's whole life: bought here, moved there, sold to them. */
export const serialHistory = asyncHandler(async (req, res) => {
  const serial = await ProductSerial.findOne({
    where: { serialNumber: req.params.serialNumber, detstatus: false },
    include: [
      { model: Product, attributes: ['id', 'productName', 'sku'] },
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
    ],
  });
  if (!serial) return res.status(404).json({ message: 'Serial number not found' });

  const movements = await StockMovement.findAll({
    where: { serialNumber: serial.serialNumber, detstatus: false },
    order: [['id', 'ASC']],
  });

  res.json({ serial, movements });
});

export const createSerials = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const numbers = (req.body.serialNumbers || '')
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!numbers.length) throw Object.assign(new Error('Enter at least one serial number'), { status: 400 });

    const rows = [];
    for (const serialNumber of numbers) {
      const exists = await ProductSerial.findOne({
        where: { serialNumber, productId: req.body.productId, detstatus: false }, transaction,
      });
      if (exists) {
        throw Object.assign(new Error(`Serial ${serialNumber} already exists for this product`), { status: 409 });
      }
      rows.push({
        productId: req.body.productId,
        serialNumber,
        branchId: req.body.branchId || req.branchId,
        status: 'In Stock',
        warrantyMonths: req.body.warrantyMonths || null,
        remarks: req.body.remarks || null,
        authadd: req.user.id,
      });
    }
    return ProductSerial.bulkCreate(rows, { transaction });
  });

  res.status(201).json({ created: created.length, serials: created });
});
