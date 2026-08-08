import { Op } from 'sequelize';
import { Category, Product } from '../models/index.js';
import { normalizeProductPayload, normalizeProductUpdate } from '../services/product.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

export const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.search) {
    where[Op.or] = [
      { productName: { [Op.like]: `%${req.query.search}%` } },
      { hsnCode: { [Op.like]: `%${req.query.search}%` } },
      { barcode: { [Op.like]: `%${req.query.search}%` } }
    ];
  }
  if (req.query.categoryId) where.categoryId = req.query.categoryId;
  const { rows, count } = await Product.findAndCountAll({ where, include: Category, limit, offset, order: [['addondt', 'DESC']] });
  res.json(paged(rows, count, page, limit));
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.id, detstatus: false }, include: Category });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

export const createProduct = asyncHandler(async (req, res) => {
  const payload = normalizeProductPayload(req.body, req.user?.id);
  if (req.file) payload.imagePath = `/uploads/${req.file.filename}`;
  const product = await Product.create(payload);
  res.status(201).json(product);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  const payload = normalizeProductUpdate(req.body, req.user?.id);
  if (req.file) payload.imagePath = `/uploads/${req.file.filename}`;
  await product.update(payload);
  res.json(product);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const itemToDelete = await Product.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!itemToDelete) return res.status(404).json({ message: 'Product not found' });
  await itemToDelete.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  res.status(204).send();
});

export const listCategories = asyncHandler(async (_req, res) => {
  res.json(await Category.findAll({ order: [['name', 'ASC']] }));
});
