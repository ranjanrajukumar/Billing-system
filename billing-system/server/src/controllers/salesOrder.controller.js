import { Op } from 'sequelize';
import { SalesOrder, SalesOrderItem, Customer, Company, Product, User } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { sequelize } from '../models/index.js';
import { getPagination, paged } from '../utils/pagination.js';
import { itemsTotal, normalizeOrderItems } from '../utils/lineItems.js';
import { documentOutputHandlers } from './documentOutput.js';

export const getAll = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const { page, limit, offset } = getPagination(req.query);
  // In multi-branch mode a user only sees their own branch's records.
  let where = scopedWhere(req, { detstatus: false });
  if (search) {
    where['orderNumber'] = { [Op.like]: `%${search}%` };
  }

  const { rows, count } = await SalesOrder.findAndCountAll({
    where,
    include: [
      { model: Customer, attributes: ['customerName', 'mobileNumber'] },
      { model: User, as: 'creator', attributes: ['name'] }
    ],
    limit,
    offset,
    order: [['addondt', 'DESC']]
  });

  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const item = await SalesOrder.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: Customer },
      { model: SalesOrderItem, include: [Product] }
    ]
  });
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
});

async function nextOrderNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await SalesOrder.count({ where: { orderNumber: { [Op.like]: `SO-${year}-%` } }, transaction });
  return `SO-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const create = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;
  data.authadd = req.user.id;

  const result = await sequelize.transaction(async (t) => {
    if (!data.orderNumber) {
      data.orderNumber = await nextOrderNumber(t);
    }
    if (!data.orderDate) {
      data.orderDate = new Date().toISOString().slice(0, 10);
    }
    if (!data.totalAmount && items && items.length > 0) {
      data.totalAmount = itemsTotal(items);
    }
    const parent = await SalesOrder.create(data, { transaction: t });
    if (items && items.length > 0) {
      const itemsData = normalizeOrderItems(items).map(item => ({ ...item, orderId: parent.id, authadd: req.user.id }));
      await SalesOrderItem.bulkCreate(itemsData, { transaction: t });
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
    await SalesOrder.update(data, { where: { id: req.params.id }, transaction: t });

    if (items) {
      await SalesOrderItem.destroy({ where: { orderId: req.params.id }, transaction: t });
      const itemsData = normalizeOrderItems(items).map(item => ({ ...item, orderId: req.params.id, authadd: req.user.id }));
      await SalesOrderItem.bulkCreate(itemsData, { transaction: t });
    }
  });

  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  await SalesOrder.update(
    { detstatus: true, authdel: req.user.id, delondt: new Date() },
    { where: { id: req.params.id } }
  );
  res.json({ message: 'Deleted successfully' });
});

const loadOrder = (req) => SalesOrder.findOne({
  where: { id: req.params.id, detstatus: false },
  include: [{ model: Customer }, { model: SalesOrderItem, include: [Product] }]
});

export const { downloadPdf, html } = documentOutputHandlers('salesOrder', loadOrder);
