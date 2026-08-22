import { Op } from 'sequelize';
import { DeliveryChallan, DeliveryChallanItem, Customer, Product, User, StockMovement } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { paged } from '../../utils/pagination.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { withDateRange } from '../../utils/dateRange.js';
import { sequelize } from '../../models/index.js';
import { documentOutputHandlers } from '../platform/documentOutput.js';

const loadChallan = (req) => DeliveryChallan.findOne({
  where: { id: req.params.id, detstatus: false },
  include: [{ model: Customer }, { model: DeliveryChallanItem, include: [Product] }]
});

export const { downloadPdf, html } = documentOutputHandlers('deliveryChallan', loadChallan);

export const getAll = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  // In multi-branch mode a user only sees their own branch's records.
  let where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'challanDate');
  if (search) {
    where['challanNumber'] = { [Op.like]: `%${search}%` };
  }

  const { rows, count } = await DeliveryChallan.findAndCountAll({
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
  const item = await DeliveryChallan.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: Customer },
      { model: DeliveryChallanItem, include: [Product] }
    ]
  });
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
});

async function nextChallanNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await DeliveryChallan.count({ where: { challanNumber: { [Op.like]: `DC-${year}-%` } }, transaction });
  return `DC-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const create = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;
  data.authadd = req.user.id;
  // The list is filtered by branch, so a record saved without one would be
  // invisible the moment it was created.
  data.branchId = data.branchId || req.branchId;

  const result = await sequelize.transaction(async (t) => {
    if (!data.challanNumber) {
      data.challanNumber = await nextChallanNumber(t);
    }
    if (!data.challanDate) {
      data.challanDate = new Date().toISOString().slice(0, 10);
    }
    const parent = await DeliveryChallan.create(data, { transaction: t });
    if (items && items.length > 0) {
      const parentIdField = 'challanId';
      const itemsData = items.map(item => ({ ...item, [parentIdField]: parent.id, authadd: req.user.id }));
      await DeliveryChallanItem.bulkCreate(itemsData, { transaction: t });

      await Promise.all(items.map((item) => Product.decrement('stock', { by: item.quantity, where: { id: item.productId }, transaction: t })));
      
      await StockMovement.bulkCreate(items.map((item) => ({
        productId: item.productId,
        createdBy: req.user.id,
        movementType: 'Sale',
        quantity: -item.quantity,
        referenceType: 'Delivery Challan',
        referenceId: parent.id,
        notes: `Delivered via ${parent.challanNumber}`,
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
    await DeliveryChallan.update(data, { where: { id: req.params.id }, transaction: t });

    if (items) {
      const parentIdField = 'challanId';
      await DeliveryChallanItem.destroy({ where: { [parentIdField]: req.params.id }, transaction: t });
      const itemsData = items.map(item => ({ ...item, [parentIdField]: req.params.id, authadd: req.user.id }));
      await DeliveryChallanItem.bulkCreate(itemsData, { transaction: t });
    }
  });

  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  await DeliveryChallan.update(
    { detstatus: true, authdel: req.user.id, delondt: new Date() },
    { where: { id: req.params.id } }
  );
  res.json({ message: 'Deleted successfully' });
});
