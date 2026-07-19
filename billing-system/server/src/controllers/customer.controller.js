import { Op } from 'sequelize';
import { Customer } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

export const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const q = req.query.search || '';
  const where = q ? {
    [Op.or]: [
      { customerName: { [Op.like]: `%${q}%` } },
      { mobileNumber: { [Op.like]: `%${q}%` } },
      { email: { [Op.like]: `%${q}%` } },
      { gstNumber: { [Op.like]: `%${q}%` } }
    ]
  } : {};
  const { rows, count } = await Customer.findAndCountAll({ where, limit, offset, order: [['addondt', 'DESC']] });
  res.json(paged(rows, count, page, limit));
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  res.json(customer);
});

export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.create({ ...req.body, authadd: req.user?.id });
  res.status(201).json(customer);
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  await customer.update({ ...req.body, authlstedit: req.user?.id });
  res.json(customer);
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const itemToDelete = await Customer.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!itemToDelete) return res.status(404).json({ message: 'Customer not found' });
  await itemToDelete.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  res.status(204).send();
});
