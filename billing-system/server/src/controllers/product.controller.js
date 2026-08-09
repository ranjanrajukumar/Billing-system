import { Op } from 'sequelize';
import { Category, Product } from '../models/index.js';
import { normalizeProductPayload, normalizeProductUpdate } from '../services/product.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { imageColumns } from '../utils/imageUpload.js';
import { setBranchStock } from '../services/stock.service.js';

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
  const payload = { ...normalizeProductPayload(req.body, req.user?.id), ...imageColumns(req.file, 'image') };
  const product = await Product.create(payload);
  // Opening stock belongs to the branch creating the product; without this the
  // product would exist with no stock anywhere and could never be sold.
  await setBranchStock({
    productId: product.id,
    branchId: req.branchId,
    quantity: product.stock,
    userId: req.user?.id,
  });
  // Re-read through the default scope so the image bytes stay out of the response.
  res.status(201).json(await Product.findByPk(product.id, { include: Category }));
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  const payload = { ...normalizeProductUpdate(req.body, req.user?.id), ...imageColumns(req.file, 'image') };
  await product.update(payload);
  // Editing stock on the product form sets the acting branch's quantity.
  if (payload.stock !== undefined) {
    await setBranchStock({
      productId: product.id,
      branchId: req.branchId,
      quantity: payload.stock,
      userId: req.user?.id,
    });
  }
  res.json(await Product.findByPk(product.id, { include: Category }));
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
