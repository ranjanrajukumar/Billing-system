import { Product, StockMovement } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

export const listStock = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await Product.findAndCountAll({ where: { detstatus: false }, limit, offset, order: [['productName', 'ASC']] });
  res.json(paged(rows, count, page, limit));
});

export const listStockMovements = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await StockMovement.findAndCountAll({
    include: Product,
    limit,
    offset,
    order: [['addondt', 'DESC']]
  });
  res.json(paged(rows, count, page, limit));
});

export const adjustStock = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.body.productId, detstatus: false } });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const quantity = Number(req.body.quantity || 0);
  const isOut = req.body.movementType === 'Adjustment Out';
  if (isOut && Number(product.stock) < quantity) return res.status(409).json({ message: 'Insufficient stock' });

  await product[isOut ? 'decrement' : 'increment']('stock', { by: quantity });
  const movement = await StockMovement.create({
    productId: product.id,
    createdBy: req.user.id,
    movementType: req.body.movementType,
    quantity,
    referenceType: 'Adjustment',
    notes: req.body.notes
  });
  res.status(201).json(movement);
});
