import { Op } from 'sequelize';
import { Customer } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

export const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const q = req.query.search || '';
  // Deleted customers must not appear in the list; every other endpoint
  // filters them out, so listing them made View/Edit fail with a 404.
  const where = { detstatus: false };
  if (q) {
    where[Op.or] = [
      { customerName: { [Op.like]: `%${q}%` } },
      { mobileNumber: { [Op.like]: `%${q}%` } },
      { email: { [Op.like]: `%${q}%` } },
      { gstNumber: { [Op.like]: `%${q}%` } }
    ];
  }
  const { rows, count } = await Customer.findAndCountAll({ where, limit, offset, order: [['addondt', 'DESC']] });
  res.json(paged(rows, count, page, limit));
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  res.json(customer);
});

function sanitizeCustomer(data) {
  const payload = { ...data };
  if (!payload.email || typeof payload.email !== 'string' || !payload.email.trim()) {
    delete payload.email;
  } else {
    payload.email = payload.email.trim();
  }
  if (!payload.gstNumber || typeof payload.gstNumber !== 'string' || !payload.gstNumber.trim()) {
    delete payload.gstNumber;
  } else {
    payload.gstNumber = payload.gstNumber.trim();
  }
  payload.customerName = (payload.customerName && typeof payload.customerName === 'string') ? payload.customerName.trim() : '';
  payload.mobileNumber = (payload.mobileNumber && typeof payload.mobileNumber === 'string') ? payload.mobileNumber.trim() : '';
  payload.address = (payload.address && typeof payload.address === 'string') ? payload.address.trim() : '';
  payload.city = (payload.city && typeof payload.city === 'string') ? payload.city.trim() : '';
  payload.state = (payload.state && typeof payload.state === 'string') ? payload.state.trim() : '';
  payload.pincode = (payload.pincode && typeof payload.pincode === 'string') ? payload.pincode.trim() : '';
  return payload;
}

export const createCustomer = asyncHandler(async (req, res) => {
  const payload = sanitizeCustomer(req.body);
  const customer = await Customer.create({ ...payload, authadd: req.user?.id });
  res.status(201).json(customer);
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  const payload = sanitizeCustomer(req.body);
  await customer.update({ ...payload, authlstedit: req.user?.id });
  res.json(customer);
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const itemToDelete = await Customer.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!itemToDelete) return res.status(404).json({ message: 'Customer not found' });
  await itemToDelete.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  res.status(204).send();
});
