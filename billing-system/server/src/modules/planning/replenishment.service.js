import { QueryTypes } from 'sequelize';
import { randomUUID } from 'crypto';
import {
  sequelize, Branch, InventoryPolicy, Product, ReplenishmentRecommendation,
} from '../../models/index.js';

/**
 * The replenishment engine: what to bring in, where, how much, and why.
 *
 * The arithmetic is deliberately the plain one a buyer already does on paper:
 *
 *   required = forecast demand over the cover window
 *            + safety stock
 *            − stock available now
 *            − stock already on its way
 *
 * A more elaborate model would not be more correct, and it would be much harder
 * to argue with. Every term is stored on the recommendation so the line can
 * show its working, because a buyer who cannot see why the number is 205 will
 * order what they were going to order anyway.
 *
 * The cover window is lead time plus review period rather than a flat month.
 * An order has to survive until the *next* order can arrive, so a weekly review
 * cycle with a three-day lead time needs ten days of cover, not three.
 */

// Used when nothing has been configured. A week is long enough to be safe for
// most suppliers and short enough that a wrong default is noticed quickly.
const DEFAULT_LEAD_TIME_DAYS = 7;
const DEFAULT_REVIEW_PERIOD_DAYS = 7;

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * The planning parameters in force for one line.
 *
 * Location policy wins over product default wins over system default, so fifty
 * stores work sensibly out of the box and the ones that matter can be tuned
 * individually.
 */
export function resolvePolicy(product, policy) {
  const pick = (policyValue, productValue, fallback) => {
    if (policyValue !== null && policyValue !== undefined && policyValue !== '') return num(policyValue, fallback);
    if (productValue !== null && productValue !== undefined && productValue !== '') return num(productValue, fallback);
    return fallback;
  };

  const leadTimeDays = pick(policy?.leadTimeDays, product?.leadTimeDays, DEFAULT_LEAD_TIME_DAYS);
  const reviewPeriodDays = pick(policy?.reviewPeriodDays, null, DEFAULT_REVIEW_PERIOD_DAYS);

  // Safety stock falls back to the minimum stock level, which is what a shop
  // that has never heard the phrase "safety stock" has already told us: the
  // quantity they do not want to go below.
  const minimumStock = pick(policy?.minimumStock, product?.minimumStock, 0);
  const safetyStock = pick(policy?.safetyStock, product?.safetyStock, minimumStock);

  return {
    minimumStock,
    maximumStock: pick(policy?.maximumStock, product?.maximumStock, 0) || null,
    safetyStock,
    reorderPoint: policy?.reorderPoint === null || policy?.reorderPoint === undefined
      ? null
      : num(policy.reorderPoint),
    orderMultiple: pick(policy?.orderMultiple, product?.orderMultiple, 0) || null,
    minimumOrderQty: pick(policy?.minimumOrderQty, product?.minimumOrderQty, 0) || null,
    economicOrderQty: policy?.economicOrderQty ? num(policy.economicOrderQty) : null,
    leadTimeDays,
    reviewPeriodDays,
    coverDays: leadTimeDays + reviewPeriodDays,
    autoReplenish: Boolean(policy?.autoReplenish),
    preferredSource: policy?.preferredSource || 'Auto',
    preferredSupplierId: policy?.preferredSupplierId || null,
    isActive: policy ? policy.isActive !== false : true,
  };
}

/**
 * Rounds a raw requirement into something a supplier will actually ship.
 *
 * Order multiples round up, never down: ordering eleven of a case of twelve
 * gets you nothing, and rounding down reintroduces the shortfall the
 * calculation just identified.
 */
function applyOrderRules(required, policy) {
  if (required <= 0) return 0;

  let quantity = required;
  if (policy.minimumOrderQty && quantity < policy.minimumOrderQty) quantity = policy.minimumOrderQty;
  if (policy.orderMultiple && policy.orderMultiple > 0) {
    quantity = Math.ceil(quantity / policy.orderMultiple) * policy.orderMultiple;
  }
  return Math.ceil(quantity * 1000) / 1000;
}

/**
 * Stock on its way to a location and not yet counted in `branch_stock`.
 *
 * Both halves matter. Open purchase orders are the obvious one; transfers
 * already dispatched from another location are the one that gets missed, and
 * missing it means ordering a second time for stock that is on a lorry.
 */
async function fetchIncomingStock(branchId = null) {
  const replacements = {};
  let poFilter = '';
  let transferFilter = '';
  if (branchId) {
    poFilter = ' AND po.branch_id = :branchId';
    transferFilter = ' AND st.to_branch_id = :branchId';
    replacements.branchId = branchId;
  }

  const rows = await sequelize.query(`
    SELECT product_id AS productId, branch_id AS branchId, SUM(qty) AS qty FROM (
      SELECT
        poi.product_id,
        po.branch_id,
        GREATEST(poi.quantity - poi.received_qty, 0) AS qty
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE po.detstatus = 0
        AND poi.detstatus = 0
        AND po.status IN ('Approved', 'Partially Received')
        ${poFilter}

      UNION ALL

      SELECT
        sti.product_id,
        st.to_branch_id AS branch_id,
        GREATEST(sti.dispatched_qty - sti.received_qty, 0) AS qty
      FROM stock_transfer_items sti
      JOIN stock_transfers st ON st.id = sti.transfer_id
      WHERE st.detstatus = 0
        AND sti.detstatus = 0
        AND st.status IN ('Dispatched', 'InTransit', 'PartiallyReceived')
        ${transferFilter}
    ) incoming
    GROUP BY product_id, branch_id
  `, { replacements, type: QueryTypes.SELECT });

  const byKey = new Map();
  for (const row of rows) {
    byKey.set(`${row.productId}:${row.branchId}`, num(row.qty));
  }
  return byKey;
}

/** On-hand and reserved quantities per product and location. */
async function fetchStockPositions(branchId = null) {
  const replacements = {};
  const filter = branchId ? ' AND branch_id = :branchId' : '';
  if (branchId) replacements.branchId = branchId;

  const rows = await sequelize.query(`
    SELECT product_id AS productId, branch_id AS branchId,
           SUM(stock) AS stock, SUM(reserved_quantity) AS reserved
    FROM branch_stock
    WHERE detstatus = 0 ${filter}
    GROUP BY product_id, branch_id
  `, { replacements, type: QueryTypes.SELECT });

  const byKey = new Map();
  for (const row of rows) {
    byKey.set(`${row.productId}:${row.branchId}`, {
      stock: num(row.stock),
      reserved: num(row.reserved),
    });
  }
  return byKey;
}

/**
 * Forecast demand per line over the next `days`, from stored daily forecasts.
 *
 * Reads what was forecast rather than recomputing, so a recommendation and the
 * planning screen can never disagree about what demand was expected.
 */
async function fetchForecastWindow(branchId, maxDays) {
  const replacements = { maxDays };
  const filter = branchId ? ' AND branch_id = :branchId' : '';
  if (branchId) replacements.branchId = branchId;

  const rows = await sequelize.query(`
    SELECT
      product_id AS productId,
      branch_id  AS branchId,
      DATEDIFF(period_start, CURDATE()) AS dayOffset,
      COALESCE(override_qty, forecast_qty) AS qty
    FROM demand_forecasts
    WHERE detstatus = 0
      AND period_type = 'Daily'
      AND period_start >= CURDATE()
      AND period_start < DATE_ADD(CURDATE(), INTERVAL :maxDays DAY)
      ${filter}
  `, { replacements, type: QueryTypes.SELECT });

  // Kept per-day so each line can take exactly its own cover window rather than
  // a single shared horizon — lead times differ per product, which is the whole
  // point of storing them.
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.productId}:${row.branchId}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ offset: num(row.dayOffset), qty: num(row.qty) });
  }
  return byKey;
}

/** Locations holding more than they need, as candidates to transfer from. */
async function fetchTransferCandidates() {
  const rows = await sequelize.query(`
    SELECT bs.product_id AS productId, bs.branch_id AS branchId,
           SUM(bs.stock - bs.reserved_quantity) AS available
    FROM branch_stock bs
    WHERE bs.detstatus = 0
    GROUP BY bs.product_id, bs.branch_id
    HAVING available > 0
  `, { type: QueryTypes.SELECT });

  const byProduct = new Map();
  for (const row of rows) {
    const productId = Number(row.productId);
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push({ branchId: Number(row.branchId), available: num(row.available) });
  }
  return byProduct;
}

function urgencyFor(daysOfCover, leadTimeDays) {
  if (daysOfCover === null) return 'Normal';
  if (daysOfCover <= 0) return 'Critical';       // already out, or promised away
  if (daysOfCover < leadTimeDays) return 'High'; // will run out before a reorder can land
  if (daysOfCover < leadTimeDays * 2) return 'Normal';
  return 'Low';
}

/**
 * Produces a fresh set of recommendations.
 *
 * Previous pending lines are marked Expired rather than deleted: somebody may
 * be looking at one right now, and a recommendation that vanishes mid-decision
 * is worse than one clearly marked as superseded. Anything already approved or
 * ordered is left alone — it is a record of a decision, not a suggestion.
 */
export async function generateRecommendations({ branchId = null, userId = null } = {}) {
  const runId = randomUUID().slice(0, 32);
  const generatedAt = new Date();

  const [stockByKey, incomingByKey, transferCandidates] = await Promise.all([
    fetchStockPositions(branchId),
    fetchIncomingStock(branchId),
    fetchTransferCandidates(),
  ]);

  // 90 days is comfortably beyond any sane lead time plus review period; each
  // line then takes the slice it needs.
  const forecastByKey = await fetchForecastWindow(branchId, 90);

  const branches = await Branch.findAll({
    where: { detstatus: false, ...(branchId ? { id: branchId } : {}) },
    attributes: ['id', 'branchName', 'locationType'],
  });
  const branchIds = new Set(branches.map((branch) => branch.id));
  if (branchIds.size === 0) return { runId, generated: 0, message: 'No active locations.' };

  const products = await Product.findAll({ where: { detstatus: false } });
  const productById = new Map(products.map((product) => [product.id, product]));

  const policies = await InventoryPolicy.findAll({ where: { detstatus: false } });
  const policyByKey = new Map(policies.map((policy) => [`${policy.productId}:${policy.branchId}`, policy]));

  // Every line that could need stock: anything with a forecast, stock on hand,
  // or a policy asking for it to be planned.
  const candidateKeys = new Set([
    ...forecastByKey.keys(),
    ...stockByKey.keys(),
    ...policyByKey.keys(),
  ]);

  const records = [];

  for (const key of candidateKeys) {
    const [productIdRaw, branchIdRaw] = key.split(':');
    const productId = Number(productIdRaw);
    const currentBranchId = Number(branchIdRaw);
    if (!branchIds.has(currentBranchId)) continue;

    const product = productById.get(productId);
    if (!product) continue;

    const policy = resolvePolicy(product, policyByKey.get(key));
    if (!policy.isActive) continue;

    const position = stockByKey.get(key) || { stock: 0, reserved: 0 };
    const incoming = incomingByKey.get(key) || 0;
    const available = position.stock - position.reserved;

    // Demand across this line's own cover window.
    const forecastDays = forecastByKey.get(key) || [];
    const forecastQty = forecastDays
      .filter((day) => day.offset >= 0 && day.offset < policy.coverDays)
      .reduce((total, day) => total + day.qty, 0);

    // A line with neither demand nor stock is not a planning problem.
    if (forecastQty <= 0 && available <= 0 && incoming <= 0) continue;

    const rawRequired = forecastQty + policy.safetyStock - available - incoming;
    let recommendedQty = applyOrderRules(rawRequired, policy);

    // Never propose an order that would breach the ceiling the business set.
    if (policy.maximumStock && recommendedQty > 0) {
      const headroom = policy.maximumStock - (available + incoming);
      recommendedQty = Math.max(0, Math.min(recommendedQty, headroom));
    }

    if (recommendedQty <= 0) continue;

    const dailyRate = policy.coverDays > 0 ? forecastQty / policy.coverDays : 0;
    const daysOfCover = dailyRate > 0
      ? Math.round(((available + incoming) / dailyRate) * 100) / 100
      : null;

    // Prefer moving stock that already exists over buying more of it, but only
    // from a location with a genuine surplus — robbing one store to fill
    // another just moves the stockout.
    let sourceType = 'Purchase';
    let sourceBranchId = null;
    if (policy.preferredSource !== 'Purchase') {
      const surplus = (transferCandidates.get(productId) || [])
        .filter((candidate) => candidate.branchId !== currentBranchId)
        .map((candidate) => {
          const candidateKey = `${productId}:${candidate.branchId}`;
          const candidatePolicy = resolvePolicy(product, policyByKey.get(candidateKey));
          const candidateForecast = (forecastByKey.get(candidateKey) || [])
            .filter((day) => day.offset >= 0 && day.offset < candidatePolicy.coverDays)
            .reduce((total, day) => total + day.qty, 0);
          return {
            branchId: candidate.branchId,
            spare: candidate.available - candidateForecast - candidatePolicy.safetyStock,
          };
        })
        .filter((candidate) => candidate.spare > 0)
        .sort((a, b) => b.spare - a.spare)[0];

      if (surplus && surplus.spare >= recommendedQty * 0.5) {
        sourceType = 'Transfer';
        sourceBranchId = surplus.branchId;
      }
    }

    const urgency = urgencyFor(daysOfCover, policy.leadTimeDays);
    const rationale = sourceType === 'Transfer'
      ? `Needs ${recommendedQty} to cover ${Math.round(forecastQty)} forecast demand over `
        + `${policy.coverDays} days plus ${policy.safetyStock} safety stock, against ${available} `
        + `available and ${incoming} incoming. Location ${sourceBranchId} holds spare stock.`
      : `Needs ${recommendedQty} to cover ${Math.round(forecastQty)} forecast demand over `
        + `${policy.coverDays} days (lead time ${policy.leadTimeDays}d + review ${policy.reviewPeriodDays}d) `
        + `plus ${policy.safetyStock} safety stock, against ${available} available and ${incoming} incoming.`;

    records.push({
      runId,
      productId,
      branchId: currentBranchId,
      currentStock: position.stock,
      reservedStock: position.reserved,
      incomingStock: incoming,
      forecastQty: Math.round(forecastQty * 1000) / 1000,
      horizonDays: policy.coverDays,
      safetyStock: policy.safetyStock,
      reorderPoint: policy.reorderPoint ?? Math.round((forecastQty + policy.safetyStock) * 1000) / 1000,
      leadTimeDays: policy.leadTimeDays,
      rawRequiredQty: Math.round(rawRequired * 1000) / 1000,
      recommendedQty,
      daysOfCover,
      urgency,
      sourceType,
      sourceBranchId,
      supplierId: policy.preferredSupplierId,
      estimatedCost: Math.round(recommendedQty * num(product.purchasePrice) * 100) / 100,
      rationale: rationale.slice(0, 500),
      status: 'Pending',
      generatedAt,
      authadd: userId,
    });
  }

  await sequelize.transaction(async (transaction) => {
    // Supersede, don't delete — see the note on this function.
    await ReplenishmentRecommendation.update(
      { status: 'Expired' },
      {
        where: { status: 'Pending', detstatus: false, ...(branchId ? { branchId } : {}) },
        transaction,
      },
    );

    const CHUNK = 500;
    for (let i = 0; i < records.length; i += CHUNK) {
      await ReplenishmentRecommendation.bulkCreate(records.slice(i, i + CHUNK), { transaction });
    }
  });

  return {
    runId,
    generated: records.length,
    generatedAt,
    critical: records.filter((record) => record.urgency === 'Critical').length,
    transfers: records.filter((record) => record.sourceType === 'Transfer').length,
    estimatedValue: Math.round(records.reduce((total, record) => total + num(record.estimatedCost), 0) * 100) / 100,
  };
}

export const __testing = { resolvePolicy, applyOrderRules, urgencyFor };
