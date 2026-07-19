import { Op } from 'sequelize';
import { SalesOrder, SalesOrderItem, Customer, Product, User } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sequelize } from '../models/index.js';

export const getAll = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  let where = { detstatus: false };
  if (search) {
    where['orderNumber'] = { [Op.like]: `%${search}%` };
  }

  const { rows, count } = await SalesOrder.findAndCountAll({
    where,
    include: [
      { model: Customer, attributes: ['customerName', 'mobileNumber'] },
      { model: User, as: 'creator', attributes: ['name'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['addondt', 'DESC']]
  });

  res.json({ data: rows, total: count, page: parseInt(page), pages: Math.ceil(count / limit) });
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

export const create = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;
  data.authadd = req.user.id;

  const result = await sequelize.transaction(async (t) => {
    const parent = await SalesOrder.create(data, { transaction: t });
    if (items && items.length > 0) {
      const parentIdField = 'orderId';
      const itemsData = items.map(item => ({ ...item, [parentIdField]: parent.id, authadd: req.user.id }));
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
      const parentIdField = 'orderId';
      await SalesOrderItem.destroy({ where: { [parentIdField]: req.params.id }, transaction: t });
      const itemsData = items.map(item => ({ ...item, [parentIdField]: req.params.id, authadd: req.user.id }));
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
