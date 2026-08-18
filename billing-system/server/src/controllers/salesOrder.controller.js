import { Op } from 'sequelize';
import { SalesOrder, SalesOrderItem, Customer, Company, Product, User } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { withDateRange } from '../utils/dateRange.js';
import { sequelize } from '../models/index.js';
import { getPagination, paged } from '../utils/pagination.js';
import { itemsTotal, normalizeOrderItems } from '../utils/lineItems.js';
import { documentOutputHandlers } from './documentOutput.js';
import { releaseReservation, reserveStock } from '../services/stock.service.js';
import { houseOwnerId } from '../services/stockOwner.service.js';

export const getAll = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const { page, limit, offset } = getPagination(req.query);
  // In multi-branch mode a user only sees their own branch's records.
  let where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'orderDate');
  if (search) {
    where['orderNumber'] = { [Op.like]: `%${search}%` };
  }
  if (req.query.status) {
    where.status = req.query.status;
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
  // The list is filtered by branch, so a record saved without one would be
  // invisible the moment it was created.
  data.branchId = data.branchId || req.branchId;

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

/**
 * Confirm a Sales Order — validates and reserves stock for every line.
 *
 * A confirmed order is a binding commitment: the stock is locked for it and
 * will not be sold to anyone else. If available stock is insufficient for any
 * line the whole operation is rejected, the reservation is rolled back and the
 * response tells the caller exactly which product is short.
 */
export const confirm = asyncHandler(async (req, res) => {
  const order = await SalesOrder.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: SalesOrderItem, include: [Product] }],
  });
  if (!order) return res.status(404).json({ message: 'Sales order not found' });
  if (order.status === 'Approved') return res.status(400).json({ message: 'Order is already confirmed' });
  if (order.status === 'Cancelled') return res.status(400).json({ message: 'Cannot confirm a cancelled order' });

  const branchId = order.branchId || req.branchId;

  await sequelize.transaction(async (t) => {
    const owner = await houseOwnerId(t);
    // Reserve stock for every line inside one transaction so either all succeed
    // or none do — partial reservation would leave orphaned locks.
    for (const item of order.SalesOrderItems) {
      await reserveStock({
        productId: item.productId,
        branchId,
        quantity: Number(item.primaryQty || item.quantity),
        transaction: t,
        userId: req.user.id,
        ownerId: owner,
      });
    }
    await order.update({ status: 'Approved', authlstedit: req.user.id }, { transaction: t });
  });

  res.json({ message: 'Order confirmed and stock reserved', orderId: order.id });
});

/**
 * Cancel a Sales Order — releases any stock reservation and soft-deletes.
 */
export const cancel = asyncHandler(async (req, res) => {
  const order = await SalesOrder.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: SalesOrderItem }],
  });
  if (!order) return res.status(404).json({ message: 'Sales order not found' });

  const branchId = order.branchId || req.branchId;

  await sequelize.transaction(async (t) => {
    // Only release if the order had actually reserved stock.
    if (order.status === 'Confirmed') {
      const owner = await houseOwnerId(t);
      for (const item of order.SalesOrderItems) {
        await releaseReservation({
          productId: item.productId,
          branchId,
          quantity: Number(item.primaryQty || item.quantity),
          transaction: t,
          userId: req.user.id,
          ownerId: owner,
        });
      }
    }
    await order.update({
      status: 'Cancelled',
      detstatus: true,
      authdel: req.user.id,
      delondt: new Date(),
    }, { transaction: t });
  });

  res.json({ message: 'Order cancelled and stock reservation released' });
});

const loadOrder = (req) => SalesOrder.findOne({
  where: { id: req.params.id, detstatus: false },
  include: [{ model: Customer }, { model: SalesOrderItem, include: [Product] }]
});

export const { downloadPdf, html } = documentOutputHandlers('salesOrder', loadOrder);

