import { Op } from 'sequelize';
import { Category, Product, ProductBatch } from '../models/index.js';
import { normalizeProductPayload, normalizeProductUpdate } from '../services/product.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { imageColumns } from '../utils/imageUpload.js';
import { getBranchStock, setBranchStock } from '../services/stock.service.js';

export const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.search) {
    where[Op.or] = [
      { productName: { [Op.like]: `%${req.query.search}%` } },
      { sku: { [Op.like]: `%${req.query.search}%` } },
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

/**
 * Resolves a scanned code to a product, with the lots it can be sold from.
 *
 * A barcode scanner types the code and presses Enter, so this has to answer
 * with everything the till needs in one round trip.
 */
export const lookupByBarcode = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ message: 'No barcode given' });

  const product = await Product.findOne({
    where: { barcode: code, detstatus: false },
    include: Category,
  });
  if (!product) return res.status(404).json({ message: `No product has the barcode ${code}` });

  const batches = await ProductBatch.findAll({
    where: {
      productId: product.id,
      branchId: req.branchId,
      detstatus: false,
      quantity: { [Op.gt]: 0 },
    },
    order: [['expiryDate', 'ASC'], ['id', 'ASC']],
  });

  const today = new Date().toISOString().slice(0, 10);
  res.json({
    product,
    // Expired lots are excluded: the till should never offer them.
    batches: batches.filter((b) => !b.expiryDate || b.expiryDate >= today),
    branchStock: await getBranchStock(product.id, req.branchId),
  });
});

/**
 * Gives a product a barcode, generating one when none is supplied.
 *
 * Generated codes are 13 digits so an ordinary retail scanner reads them, and
 * are checked for collisions rather than trusted to be unique by luck.
 */
export const assignBarcode = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  let code = String(req.body?.barcode || '').trim();
  if (!code) {
    // Prefixed with the id so codes stay related to the catalogue, padded out
    // to a fixed width, and retried in the unlikely event of a clash.
    for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
      const candidate = `2${String(product.id).padStart(5, '0')}${String(Date.now()).slice(-7)}`.slice(0, 13);
      const clash = await Product.findOne({ where: { barcode: candidate, detstatus: false } });
      if (!clash) code = candidate;
    }
    if (!code) return res.status(409).json({ message: 'Could not generate a free barcode, please set one manually' });
  } else {
    // Only live products can block a code; a deleted one frees its barcode.
    const clash = await Product.findOne({
      where: { barcode: code, detstatus: false, id: { [Op.ne]: product.id } },
    });
    if (clash) {
      return res.status(409).json({ message: `Barcode ${code} is already used by ${clash.productName}` });
    }
  }

  await product.update({ barcode: code, authlstedit: req.user?.id });
  res.json({ id: product.id, productName: product.productName, barcode: code });
});
