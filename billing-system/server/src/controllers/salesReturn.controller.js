import { Op } from 'sequelize';
import { SalesReturn, SalesReturnItem, Customer, Product, User, StockMovement, Company } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { paged } from '../utils/pagination.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { withDateRange } from '../utils/dateRange.js';
import { sequelize } from '../models/index.js';
import { documentOutputHandlers } from './documentOutput.js';
import { adjustStock } from '../services/stock.service.js';

// The client posts items as quantity/rate; the model stores a refund amount.
function normalizeReturnItems(items = []) {
  return items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const refundAmount = item.refundAmount !== undefined
      ? Number(item.refundAmount)
      : quantity * Number(item.rate || 0);
    return { productId: item.productId, quantity, refundAmount };
  });
}

const refundTotal = (items) => normalizeReturnItems(items).reduce((sum, item) => sum + item.refundAmount, 0);

export const getAll = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  // In multi-branch mode a user only sees their own branch's records.
  let where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'returnDate');
  if (search) {
    where['returnNumber'] = { [Op.like]: `%${search}%` };
  }

  const { rows, count } = await SalesReturn.findAndCountAll({
    where,
    include: [
      { model: Customer, attributes: ['customerName', 'mobileNumber'] },
      { model: User, as: 'creator', attributes: ['name'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['addondt', 'DESC']]
  });

  res.json(paged(rows, count, Number(page), Number(limit)));
});

export const getOne = asyncHandler(async (req, res) => {
  const item = await SalesReturn.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: Customer },
      { model: SalesReturnItem, include: [Product] }
    ]
  });
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
});

async function nextReturnNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await SalesReturn.count({ where: { returnNumber: { [Op.like]: `SR-${year}-%` } }, transaction });
  return `SR-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const create = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;
  data.authadd = req.user.id;
  // The list is filtered by branch, so a record saved without one would be
  // invisible the moment it was created.
  data.branchId = data.branchId || req.branchId;

  const result = await sequelize.transaction(async (t) => {
    if (!data.returnNumber) {
      data.returnNumber = await nextReturnNumber(t);
    }
    if (!data.returnDate) {
      data.returnDate = new Date().toISOString().slice(0, 10);
    }
    if (!data.totalRefund && items && items.length > 0) {
      data.totalRefund = refundTotal(items);
    }
    const parent = await SalesReturn.create(data, { transaction: t });
    if (items && items.length > 0) {
      const itemsData = normalizeReturnItems(items).map(item => ({ ...item, returnId: parent.id, authadd: req.user.id }));
      await SalesReturnItem.bulkCreate(itemsData, { transaction: t });

      for (const item of normalizeReturnItems(items)) {
        await adjustStock({
          productId: item.productId,
          branchId: req.branchId,
          delta: Number(item.quantity),
          transaction: t,
          userId: req.user.id,
        });
      }
      
      await StockMovement.bulkCreate(items.map((item) => ({
        productId: item.productId,
        createdBy: req.user.id,
        movementType: 'Adjustment In',
        quantity: item.quantity,
        referenceType: 'Sales Return',
        referenceId: parent.id,
        notes: `Returned via ${parent.returnNumber}`,
        authadd: req.user.id
      })), { transaction: t });
    }
    return parent;
  });

  res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;
  data.authlstedit = req.user.id;
  data.editondt = new Date();

  await sequelize.transaction(async (t) => {
    await SalesReturn.update(data, { where: { id: req.params.id }, transaction: t });

    if (items) {
      await SalesReturnItem.destroy({ where: { returnId: req.params.id }, transaction: t });
      const itemsData = normalizeReturnItems(items).map(item => ({ ...item, returnId: req.params.id, authadd: req.user.id }));
      await SalesReturnItem.bulkCreate(itemsData, { transaction: t });
    }
  });

  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  await SalesReturn.update(
    { detstatus: true, authdel: req.user.id, delondt: new Date() },
    { where: { id: req.params.id } }
  );
  res.json({ message: 'Deleted successfully' });
});

const loadReturn = (req) => SalesReturn.findOne({
  where: { id: req.params.id, detstatus: false },
  include: [{ model: Customer }, { model: SalesReturnItem, include: [Product] }]
});

export const { downloadPdf, html } = documentOutputHandlers('salesReturn', loadReturn);
