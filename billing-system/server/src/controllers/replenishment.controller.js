import { Op } from 'sequelize';
import {
  Branch, InventoryPolicy, Product, ReplenishmentRecommendation, Supplier,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { getPagination, paged } from '../utils/pagination.js';
import { generateRecommendations, resolvePolicy } from '../services/replenishment.service.js';

const included = [
  {
    model: Product,
    attributes: ['id', 'productName', 'sku', 'primaryUnit', 'purchasePrice', 'movementClass'],
  },
  { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
  { model: Branch, as: 'sourceBranch', attributes: ['id', 'branchName'] },
  { model: Supplier, attributes: ['id', 'supplierName'] },
];

export const listRecommendations = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { status = 'Pending', urgency, sourceType, search, runId } = req.query;

  const where = scopedWhere(req, { detstatus: false });
  // "all" is spelled out rather than implied by an absent filter: the default
  // has to be the actionable queue, or the screen opens on months of history.
  if (status && status !== 'all') where.status = status;
  if (urgency) where.urgency = urgency;
  if (sourceType) where.sourceType = sourceType;
  if (runId) where.runId = runId;

  const include = [...included];
  if (search) {
    include[0] = {
      ...included[0],
      where: {
        [Op.or]: [
          { productName: { [Op.like]: `%${search}%` } },
          { sku: { [Op.like]: `%${search}%` } },
        ],
      },
    };
  }

  const { rows, count } = await ReplenishmentRecommendation.findAndCountAll({
    where,
    include,
    // Most urgent first: the queue is worked from the top and rarely to the end.
    order: [
      [ReplenishmentRecommendation.sequelize.literal(
        "FIELD(urgency, 'Critical', 'High', 'Normal', 'Low')",
      ), 'ASC'],
      ['estimatedCost', 'DESC'],
    ],
    limit,
    offset,
    distinct: true,
  });

  res.json(paged(rows, count, page, limit));
});

export const runReplenishment = asyncHandler(async (req, res) => {
  const result = await generateRecommendations({
    branchId: req.branchScope || null,
    userId: req.user?.id ?? null,
  });
  res.status(201).json(result);
});

/**
 * Approve, modify or reject one line.
 *
 * Modify is not a separate endpoint: approving with a different quantity *is*
 * modifying, and splitting them into two actions produces two code paths that
 * drift. The recommended quantity is never overwritten, so the difference
 * between what was suggested and what was bought stays measurable.
 */
export const decideRecommendation = asyncHandler(async (req, res) => {
  const { action, quantity, note } = req.body || {};

  const recommendation = await ReplenishmentRecommendation.findOne({
    where: scopedWhere(req, { id: req.params.id, detstatus: false }),
  });
  if (!recommendation) return res.status(404).json({ message: 'Recommendation not found' });

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'Action must be "approve" or "reject"' });
  }

  if (['Ordered'].includes(recommendation.status)) {
    return res.status(409).json({ message: 'This recommendation has already been raised into an order' });
  }

  if (action === 'reject') {
    await recommendation.update({
      status: 'Rejected',
      decidedBy: req.user?.id ?? null,
      decidedAt: new Date(),
      decisionNote: note || null,
    });
    return res.json(recommendation);
  }

  let approvedQty = Number(recommendation.recommendedQty);
  let status = 'Approved';

  if (quantity !== undefined && quantity !== null && quantity !== '') {
    const requested = Number(quantity);
    if (!Number.isFinite(requested) || requested <= 0) {
      return res.status(400).json({ message: 'Approved quantity must be greater than zero' });
    }
    approvedQty = requested;
    if (requested !== Number(recommendation.recommendedQty)) status = 'Modified';
  }

  await recommendation.update({
    status,
    approvedQty,
    decidedBy: req.user?.id ?? null,
    decidedAt: new Date(),
    decisionNote: note || null,
  });

  res.json(recommendation);
});

/** Approving a screenful one line at a time is how a queue stops being used. */
export const decideBulk = asyncHandler(async (req, res) => {
  const { ids, action, note } = req.body || {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Provide the recommendation ids to act on' });
  }
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'Action must be "approve" or "reject"' });
  }

  const rows = await ReplenishmentRecommendation.findAll({
    where: scopedWhere(req, { id: { [Op.in]: ids }, detstatus: false, status: { [Op.ne]: 'Ordered' } }),
  });

  const decidedAt = new Date();
  for (const row of rows) {
    await row.update({
      status: action === 'approve' ? 'Approved' : 'Rejected',
      approvedQty: action === 'approve' ? Number(row.recommendedQty) : null,
      decidedBy: req.user?.id ?? null,
      decidedAt,
      decisionNote: note || null,
    });
  }

  res.json({ updated: rows.length, skipped: ids.length - rows.length });
});

/** Counts and value by urgency — the cards above the queue. */
export const replenishmentSummary = asyncHandler(async (req, res) => {
  const rows = await ReplenishmentRecommendation.findAll({
    where: scopedWhere(req, { detstatus: false, status: 'Pending' }),
    attributes: ['urgency', 'sourceType', 'estimatedCost', 'recommendedQty'],
  });

  const byUrgency = { Critical: 0, High: 0, Normal: 0, Low: 0 };
  let estimatedValue = 0;
  let units = 0;
  let transfers = 0;

  for (const row of rows) {
    byUrgency[row.urgency] = (byUrgency[row.urgency] || 0) + 1;
    estimatedValue += Number(row.estimatedCost || 0);
    units += Number(row.recommendedQty || 0);
    if (row.sourceType === 'Transfer') transfers += 1;
  }

  res.json({
    pending: rows.length,
    byUrgency,
    transfers,
    purchases: rows.length - transfers,
    units: Math.round(units * 100) / 100,
    estimatedValue: Math.round(estimatedValue * 100) / 100,
  });
});

// ---------------------------------------------------------------------------
// Inventory policies — the parameters the engine plans with
// ---------------------------------------------------------------------------

export const listPolicies = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { search, productId } = req.query;

  const where = scopedWhere(req, { detstatus: false });
  if (productId) where.productId = productId;

  const include = [
    { model: Product, attributes: ['id', 'productName', 'sku', 'minimumStock', 'leadTimeDays'] },
    { model: Branch, attributes: ['id', 'branchName'] },
  ];
  if (search) {
    include[0] = {
      ...include[0],
      where: {
        [Op.or]: [
          { productName: { [Op.like]: `%${search}%` } },
          { sku: { [Op.like]: `%${search}%` } },
        ],
      },
    };
  }

  const { rows, count } = await InventoryPolicy.findAndCountAll({
    where, include, limit, offset, order: [['id', 'DESC']], distinct: true,
  });

  res.json(paged(rows, count, page, limit));
});

/**
 * Creates or updates the policy for a line.
 *
 * Upsert rather than separate create and update: a policy is identified by the
 * product and location it describes, not by a row id the caller would have to
 * look up first.
 */
export const savePolicy = asyncHandler(async (req, res) => {
  const { productId, branchId } = req.body || {};
  if (!productId || !branchId) {
    return res.status(400).json({ message: 'Both productId and branchId are required' });
  }

  const fields = [
    'minimumStock', 'maximumStock', 'safetyStock', 'reorderPoint',
    'orderMultiple', 'minimumOrderQty', 'economicOrderQty',
    'leadTimeDays', 'reviewPeriodDays', 'serviceLevelPercent',
    'autoReplenish', 'preferredSource', 'preferredSupplierId', 'isActive', 'notes',
  ];
  const values = {};
  for (const field of fields) {
    if (req.body[field] !== undefined) values[field] = req.body[field] === '' ? null : req.body[field];
  }

  const [policy, created] = await InventoryPolicy.findOrCreate({
    where: { productId, branchId },
    defaults: { ...values, authadd: req.user?.id ?? null },
  });

  if (!created) {
    await policy.update({ ...values, detstatus: false, authlstedit: req.user?.id ?? null });
  }

  res.status(created ? 201 : 200).json(policy);
});

/** What the engine would actually use for a line, after the fallback chain. */
export const effectivePolicy = asyncHandler(async (req, res) => {
  const { productId, branchId } = req.query;
  if (!productId || !branchId) {
    return res.status(400).json({ message: 'Both productId and branchId are required' });
  }

  const product = await Product.findByPk(productId);
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const policy = await InventoryPolicy.findOne({
    where: { productId, branchId, detstatus: false },
  });

  res.json({
    productId: Number(productId),
    branchId: Number(branchId),
    hasLocationPolicy: Boolean(policy),
    effective: resolvePolicy(product, policy),
  });
});

export const removePolicy = asyncHandler(async (req, res) => {
  const policy = await InventoryPolicy.findOne({
    where: scopedWhere(req, { id: req.params.id, detstatus: false }),
  });
  if (!policy) return res.status(404).json({ message: 'Policy not found' });

  // Soft delete, matching the rest of the system: the line falls back to the
  // product defaults rather than disappearing from planning.
  await policy.update({ detstatus: true, delondt: new Date(), authdel: req.user?.id ?? null });
  res.json({ message: 'Policy removed; this line now uses the product defaults' });
});
