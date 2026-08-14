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

const TEXT_FIELDS = ['customerName', 'mobileNumber', 'address', 'city', 'state', 'pincode'];

/** Tiers a customer may be put on; anything else falls back to Retail. */
const PRICE_TIERS = ['Retail', 'Wholesale', 'Dealer'];

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Builds the customer columns from a request.
 *
 * A whitelist rather than a spread of the request body: the form posts back
 * everything it read, and a spread would let a caller set the loyalty balance,
 * the audit columns or the soft-delete flag by simply including them.
 */
function sanitizeCustomer(data) {
  const payload = {};

  for (const field of TEXT_FIELDS) payload[field] = trimmed(data[field]);

  // Blank optional identifiers are omitted rather than written as '', so a
  // unique index does not see a crowd of empty strings.
  if (trimmed(data.email)) payload.email = trimmed(data.email);
  if (trimmed(data.gstNumber)) payload.gstNumber = trimmed(data.gstNumber);

  if (data.openingBalance !== undefined && data.openingBalance !== '') {
    payload.openingBalance = Number(data.openingBalance) || 0;
  }
  if (data.creditLimit !== undefined) {
    payload.creditLimit = data.creditLimit === '' ? null : Number(data.creditLimit);
  }
  if (data.priceTier !== undefined) {
    payload.priceTier = PRICE_TIERS.includes(data.priceTier) ? data.priceTier : 'Retail';
  }

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
