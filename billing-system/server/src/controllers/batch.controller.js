import { Op } from 'sequelize';
import { Branch, Product, ProductBatch } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { batchTotal, expiringBatches } from '../services/batch.service.js';
import { getBranchStock } from '../services/stock.service.js';
import { scopedWhere } from '../middleware/branchContext.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Blank optional numbers and dates arrive as '' from a form; MySQL rejects those. */
const OPTIONAL_FIELDS = [
  'lotNumber', 'germinationPercent', 'purity', 'packingDate',
  'testDate', 'expiryDate', 'purchaseRate', 'supplierName', 'notes',
];

function sanitize(body) {
  const payload = { ...body };
  for (const field of OPTIONAL_FIELDS) {
    if (payload[field] === '' || payload[field] === undefined) delete payload[field];
  }
  return payload;
}

/** Adds the derived status every screen needs, so nobody recomputes it. */
function decorate(batch) {
  const plain = batch.toJSON ? batch.toJSON() : batch;
  const expiry = plain.expiryDate;
  const daysToExpiry = expiry
    ? Math.round((new Date(expiry) - new Date(today())) / 86400000)
    : null;

  let status = 'Active';
  if (Number(plain.quantity) <= 0) status = 'Exhausted';
  else if (expiry && expiry < today()) status = 'Expired';
  else if (daysToExpiry != null && daysToExpiry <= 60) status = 'Expiring';

  return { ...plain, daysToExpiry, status };
}

export const listBatches = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = scopedWhere(req, { detstatus: false });

  if (req.query.productId) where.productId = req.query.productId;
  if (req.query.search) {
    where[Op.or] = [
      { batchNumber: { [Op.like]: `%${req.query.search}%` } },
      { lotNumber: { [Op.like]: `%${req.query.search}%` } },
    ];
  }
  // status=expired|expiring|active narrows without the client doing date maths.
  if (req.query.status === 'expired') {
    where.expiryDate = { [Op.ne]: null, [Op.lt]: today() };
  } else if (req.query.status === 'expiring') {
    const soon = new Date();
    soon.setDate(soon.getDate() + Number(req.query.days || 60));
    where.expiryDate = { [Op.ne]: null, [Op.gte]: today(), [Op.lte]: soon.toISOString().slice(0, 10) };
  } else if (req.query.status === 'active') {
    where[Op.and] = [{ [Op.or]: [{ expiryDate: null }, { expiryDate: { [Op.gte]: today() } }] }];
    where.quantity = { [Op.gt]: 0 };
  }

  const { rows, count } = await ProductBatch.findAndCountAll({
    where,
    limit,
    offset,
    include: [
      { model: Product, attributes: ['id', 'productName', 'hsnCode'] },
      { model: Branch, attributes: ['id', 'branchName'] },
    ],
    order: [['expiryDate', 'ASC'], ['id', 'DESC']],
  });
  res.json(paged(rows.map(decorate), count, page, limit));
});

/**
 * Lots available to sell a product from, newest-usable first. Powers the batch
 * picker on the invoice screen.
 */
export const availableBatches = asyncHandler(async (req, res) => {
  const batches = await ProductBatch.findAll({
    where: {
      productId: req.params.productId,
      branchId: req.branchId,
      detstatus: false,
      quantity: { [Op.gt]: 0 },
    },
    order: [['expiryDate', 'ASC'], ['id', 'ASC']],
  });
  res.json(batches.map(decorate).filter((b) => b.status !== 'Expired'));
});

export const getBatch = asyncHandler(async (req, res) => {
  const batch = await ProductBatch.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: Product, attributes: ['id', 'productName'] }],
  });
  if (!batch) return res.status(404).json({ message: 'Batch not found' });
  res.json(decorate(batch));
});

export const createBatch = asyncHandler(async (req, res) => {
  const payload = sanitize(req.body);
  const branchId = payload.branchId || req.branchId;

  const product = await Product.findOne({ where: { id: payload.productId, detstatus: false } });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  // The lots must never claim more than the branch actually holds, or the bill
  // would allocate stock that is not there.
  const held = await getBranchStock(payload.productId, branchId);
  const alreadyInBatches = await batchTotal(payload.productId, branchId);
  const requested = Number(payload.quantity || 0);
  if (alreadyInBatches + requested > held) {
    return res.status(409).json({
      message: `Branch holds ${held} of ${product.productName}, and ${alreadyInBatches} is already assigned to batches. `
        + `This batch can be at most ${Math.max(held - alreadyInBatches, 0)}.`,
    });
  }

  const batch = await ProductBatch.create({ ...payload, branchId, authadd: req.user?.id });
  res.status(201).json(decorate(batch));
});

export const updateBatch = asyncHandler(async (req, res) => {
  const batch = await ProductBatch.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!batch) return res.status(404).json({ message: 'Batch not found' });

  const payload = sanitize(req.body);
  if (payload.quantity !== undefined) {
    const held = await getBranchStock(batch.productId, batch.branchId);
    const others = (await batchTotal(batch.productId, batch.branchId)) - Number(batch.quantity);
    if (others + Number(payload.quantity) > held) {
      return res.status(409).json({
        message: `Branch holds ${held}; other batches already account for ${others}. `
          + `This batch can be at most ${Math.max(held - others, 0)}.`,
      });
    }
  }
  // The branch a lot sits in is set when it is received, not edited afterwards.
  delete payload.branchId;

  await batch.update({ ...payload, authlstedit: req.user?.id });
  res.json(decorate(batch));
});

export const removeBatch = asyncHandler(async (req, res) => {
  const batch = await ProductBatch.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!batch) return res.status(404).json({ message: 'Batch not found' });
  await batch.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  res.status(204).send();
});

/** Expired and soon-to-expire lots, for the dashboard warning and the alerts tab. */
export const expiryAlerts = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 60;
  const batches = await expiringBatches({ days, branchId: req.query.allBranches ? null : req.branchId });

  const withProduct = await ProductBatch.findAll({
    where: { id: batches.map((b) => b.id) },
    include: [{ model: Product, attributes: ['id', 'productName'] }],
    order: [['expiryDate', 'ASC']],
  });

  const decorated = withProduct.map(decorate);
  res.json({
    days,
    expired: decorated.filter((b) => b.status === 'Expired'),
    expiringSoon: decorated.filter((b) => b.status === 'Expiring'),
    // What is sitting in lots that can no longer legally be sold for sowing.
    expiredValue: decorated
      .filter((b) => b.status === 'Expired')
      .reduce((sum, b) => sum + Number(b.quantity) * Number(b.purchaseRate || 0), 0),
  });
});

/**
 * Whether the lots for a product add up to what the branch says it holds.
 * Stock can be adjusted without touching batches, so this reports the gap
 * rather than silently guessing which side is right.
 */
export const batchReconciliation = asyncHandler(async (req, res) => {
  const branchId = req.query.branchId || req.branchId;
  const products = await Product.findAll({
    where: { detstatus: false },
    attributes: ['id', 'productName'],
    raw: true,
  });

  const report = [];
  for (const product of products) {
    const inBatches = await batchTotal(product.id, branchId);
    const held = await getBranchStock(product.id, branchId);
    // Products nobody has assigned lots to are simply untracked, not wrong.
    if (inBatches === 0 && held === 0) continue;
    report.push({
      productId: product.id,
      productName: product.productName,
      branchStock: held,
      inBatches,
      untracked: held - inBatches,
      tracked: inBatches > 0,
    });
  }

  res.json({
    branchId: Number(branchId),
    products: report.filter((r) => r.tracked || r.branchStock > 0),
    mismatched: report.filter((r) => r.tracked && r.untracked !== 0),
  });
});
