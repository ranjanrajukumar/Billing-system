import { Op } from 'sequelize';
import { sequelize, Product, StockMovement, User } from '../models/index.js';
import { buildInventorySummary } from '../services/product.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { postStockTransaction, stockLedger, stockValuation } from '../services/stock.service.js';
import { resolveOwnerId } from '../services/stockOwner.service.js';

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
