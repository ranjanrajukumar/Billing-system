import { Op } from 'sequelize';
import { sequelize, Product, StockMovement, User, BranchStock, Branch, BinStock, WarehouseBin } from '../../models/index.js';
import { buildInventorySummary } from './product.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { postStockTransaction, stockLedger, stockValuation } from './stock.service.js';
import { resolveOwnerId } from '../warehouse/stockOwner.service.js';
import { houseOwnerId } from '../warehouse/stockOwner.service.js';

export const getSummary = asyncHandler(async (_req, res) => {
  const products = await Product.findAll({
    where: { detstatus: false, isActive: true },
    order: [['stock', 'ASC']]
  });

  const summary = buildInventorySummary(products);
  const criticalProducts = products
    .filter((product) => Number(product.stock || 0) <= Number(product.lowStockThreshold || 0))
    .slice(0, 8);

  res.json({ ...summary, criticalProducts });
});

export const getMovements = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  
  if (req.query.productId) where.productId = req.query.productId;
  if (req.query.type) where.movementType = req.query.type;
  
  const { rows, count } = await StockMovement.findAndCountAll({
    where,
    include: [
      { model: Product, attributes: ['productName', 'barcode'] },
      { model: User, as: 'stockUser', attributes: ['name'] }
    ],
    limit,
    offset,
    order: [['addondt', 'DESC']]
  });
  
  res.json(paged(rows, count, page, limit));
});

export const adjustStock = asyncHandler(async (req, res) => {
  const { productId, type, quantity, notes } = req.body;
  if (!['Adjustment In', 'Adjustment Out', 'Opening Stock', 'Damage', 'Expired'].includes(type)) {
    return res.status(400).json({ message: 'Invalid adjustment type' });
  }

  const result = await sequelize.transaction(async (t) => {
    const product = await Product.findOne({ where: { id: productId, detstatus: false }, transaction: t, lock: t.LOCK.UPDATE });
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

    const qty = Math.abs(Number(quantity));
    const adding = type === 'Adjustment In' || type === 'Opening Stock';

    // Unnamed means our own goods, which is what every existing caller means.
    // A named owner is validated rather than trusted — see resolveOwnerId.
    const ownerId = await resolveOwnerId(req.body.ownerId, t);

    // One call moves the stock and writes the ledger row, so an adjustment can
    // never land without its movement.
    return postStockTransaction({
      productId: product.id,
      branchId: req.branchId,
      ownerId,
      quantity: adding ? qty : -qty,
      movementType: type,
      referenceType: type === 'Opening Stock' ? 'Opening Balance' : 'Manual Adjustment',
      unitCost: product.purchasePrice,
      notes: notes || (type === 'Opening Stock' ? 'Initial Stock' : 'Manual adjustment'),
      transaction: t,
      userId: req.user.id,
    });
  });

  res.status(201).json(result);
});

/** The full stock ledger, filterable by product, location and date. */
export const getLedger = asyncHandler(async (req, res) => {
  res.json(await stockLedger({
    productId: req.query.productId,
    branchId: req.query.branchId || req.branchScope || undefined,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
  }));
});

/** Stock valuation at cost and at sale price, per location. */
export const getValuation = asyncHandler(async (req, res) => {
  res.json(await stockValuation(req.query.branchId || req.branchScope || null));
});

/**
 * WMS Current Stock — denormalized view for the WMS screen.
 *
 * Joins branch_stock → branches (warehouses) → bin_stock → warehouse_bins
 * and resolves each bin's ancestor chain so every row carries the full path:
 *   Warehouse / Zone / Aisle / Rack / Shelf / Bin
 *
 * The available quantity = stock − reservedQuantity.
 *
 * Query params:
 *   warehouseId   — filter to a single warehouse (branch with locationType=Warehouse)
 *   productId     — filter to one product
 *   status        — 'In Stock' | 'Low Stock' | 'Out of Stock'
 *   search        — product name prefix search
 *   page, limit
 */
export const getWmsStock = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const owner = await houseOwnerId();

  // Build the BranchStock filter
  const bsWhere = { ownerId: owner, detstatus: false };
  if (req.query.warehouseId) bsWhere.branchId = req.query.warehouseId;
  if (req.query.productId) bsWhere.productId = req.query.productId;

  // Product filter (name search)
  const productWhere = { detstatus: true }; // detstatus=false = active
  // Note: detstatus: false means not deleted
  const productWhereActive = { detstatus: false };
  if (req.query.search) productWhereActive[Op.or] = [
    { productName: { [Op.like]: `%${req.query.search}%` } },
    { sku: { [Op.like]: `%${req.query.search}%` } },
  ];

  const { rows, count } = await BranchStock.findAndCountAll({
    where: bsWhere,
    include: [
      {
        model: Product,
        where: productWhereActive,
        attributes: ['id', 'productName', 'sku', 'lowStockThreshold', 'primaryUnit'],
      },
      {
        model: Branch,
        attributes: ['id', 'branchName', 'branchCode', 'locationType'],
        where: req.query.warehouseId ? { id: req.query.warehouseId } : {},
        required: false,
      },
    ],
    limit,
    offset,
    order: [['branchId', 'ASC'], ['productId', 'ASC']],
    distinct: true,
  });

  // For each branch_stock row, find which bins hold this product and build the path.
  const binAncestors = await buildBinPaths();

  const data = await Promise.all(rows.map(async (bs) => {
    const stock = Number(bs.stock || 0);
    const reserved = Number(bs.reservedQuantity || 0);
    const available = stock - reserved;
    const threshold = Number(bs.Product?.lowStockThreshold || 0);

    let stockStatus = 'In Stock';
    if (stock <= 0) stockStatus = 'Out of Stock';
    else if (stock <= threshold) stockStatus = 'Low Stock';

    // Find bins at this branch holding this product
    const binRows = await BinStock.findAll({
      where: { branchId: bs.branchId, productId: bs.productId, detstatus: false },
      include: [{ model: WarehouseBin, attributes: ['id', 'code', 'name', 'level', 'parentId'] }],
    });

    if (binRows.length === 0) {
      return [{
        productId: bs.productId,
        productName: bs.Product?.productName,
        sku: bs.Product?.sku,
        unit: bs.Product?.primaryUnit,
        warehouseId: bs.branchId,
        warehouseName: bs.Branch?.branchName,
        zone: null, aisle: null, rack: null, shelf: null, bin: null,
        availableQty: available,
        reservedQty: reserved,
        totalQty: stock,
        minStockLevel: threshold,
        stockStatus,
      }];
    }

    return binRows.map((br) => {
      const path = binAncestors[br.WarehouseBin?.id] || {};
      return {
        productId: bs.productId,
        productName: bs.Product?.productName,
        sku: bs.Product?.sku,
        unit: bs.Product?.primaryUnit,
        warehouseId: bs.branchId,
        warehouseName: bs.Branch?.branchName,
        zone: path.Zone || null,
        aisle: path.Aisle || null,
        rack: path.Rack || null,
        shelf: path.Shelf || null,
        bin: br.WarehouseBin?.code || null,
        binId: br.WarehouseBin?.id || null,
        binQty: Number(br.quantity || 0),
        availableQty: available,
        reservedQty: reserved,
        totalQty: stock,
        minStockLevel: threshold,
        stockStatus,
      };
    });
  }));

  // Filter by status after resolution
  let flat = data.flat();
  if (req.query.status) flat = flat.filter((r) => r.stockStatus === req.query.status);

  res.json(paged(flat, flat.length, page, limit));
});

/** Builds a map of binId → { Zone, Aisle, Rack, Shelf } by walking the warehouse_bins tree. */
async function buildBinPaths() {
  const allBins = await WarehouseBin.findAll({
    where: { detstatus: false },
    attributes: ['id', 'parentId', 'level', 'code', 'name'],
  });
  const byId = new Map(allBins.map((b) => [b.id, b]));

  const paths = {};
  for (const bin of allBins) {
    const path = {};
    let current = bin;
    while (current) {
      path[current.level] = current.code || current.name;
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    paths[bin.id] = path;
  }
  return paths;
}

