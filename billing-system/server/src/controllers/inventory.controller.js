import { Op } from 'sequelize';
import { sequelize, Product, StockMovement, User } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

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
  if (!['Adjustment In', 'Adjustment Out', 'Opening Stock'].includes(type)) {
    return res.status(400).json({ message: 'Invalid adjustment type' });
  }

  const result = await sequelize.transaction(async (t) => {
    const product = await Product.findOne({ where: { id: productId, detstatus: false }, transaction: t, lock: t.LOCK.UPDATE });
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

    const qty = Number(quantity);
    if (type === 'Adjustment Out' && Number(product.stock) < qty) {
      throw Object.assign(new Error(`Insufficient stock for ${product.productName}`), { status: 409 });
    }

    if (type === 'Adjustment In' || type === 'Opening Stock') {
      await product.increment('stock', { by: qty, transaction: t });
    } else {
      await product.decrement('stock', { by: qty, transaction: t });
    }

    const movement = await StockMovement.create({
      productId: product.id,
      createdBy: req.user.id,
      movementType: type,
      quantity: (type === 'Adjustment In' || type === 'Opening Stock') ? qty : -qty,
      referenceType: type === 'Opening Stock' ? 'Opening Balance' : 'Manual Adjustment',
      notes: notes || (type === 'Opening Stock' ? 'Initial Stock' : 'Manual adjustment'),
      authadd: req.user.id
    }, { transaction: t });

    return movement;
  });

  res.status(201).json(result);
});
