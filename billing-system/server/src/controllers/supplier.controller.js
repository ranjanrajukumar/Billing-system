import { Op } from 'sequelize';
import { Supplier } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

export const listSuppliers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const q = req.query.search || '';
  const where = q ? {
    [Op.or]: [
      { supplierName: { [Op.like]: `%${q}%` } },
      { contactPerson: { [Op.like]: `%${q}%` } },
      { mobileNumber: { [Op.like]: `%${q}%` } },
      { email: { [Op.like]: `%${q}%` } },
      { gstNumber: { [Op.like]: `%${q}%` } }
    ]
  } : {};
  const { rows, count } = await Supplier.findAndCountAll({ where, limit, offset, order: [['addondt', 'DESC']] });
  res.json(paged(rows, count, page, limit));
});

export const getSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
  res.json(supplier);
});

function sanitizeSupplier(data) {
  const payload = { ...data };
  if (!payload.email || !payload.email.trim()) payload.email = null;
  if (!payload.gstNumber || !payload.gstNumber.trim()) payload.gstNumber = null;
  return payload;
}

export const createSupplier = asyncHandler(async (req, res) => {
  const payload = sanitizeSupplier(req.body);
  const supplier = await Supplier.create({ ...payload, authadd: req.user?.id });
  res.status(201).json(supplier);
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
  const payload = sanitizeSupplier(req.body);
  await supplier.update({ ...payload, authlstedit: req.user?.id });
  res.json(supplier);
});

export const deleteSupplier = asyncHandler(async (req, res) => {
  const itemToDelete = await Supplier.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!itemToDelete) return res.status(404).json({ message: 'Supplier not found' });
  await itemToDelete.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  res.status(204).send();
});
