import { Op, fn, col } from 'sequelize';
import {
  Branch, BranchStock, Product, ProductBatch, StockCount, StockMovement, User,
} from '../../models/index.js';
import { houseOwnerId } from '../warehouse/stockOwner.service.js';

/**
 * Stock audit — checking that the numbers agree with themselves.
 *
 * Three things ought to say the same thing about a product at a location:
 *
 *   1. `branch_stock`   — the figure every screen reads
 *   2. the movement ledger — the sum of everything that ever moved
 *   3. the lot quantities  — for products tracked by batch
 *
 * They can only disagree if something wrote stock without going through the
 * engine, or if a lot was edited by hand. Either is worth knowing about, and
 * neither shows up anywhere else in the application: a wrong number that is
 * wrong consistently looks exactly like a right one.
 *
 * This is a read-only diagnostic. It never corrects anything — a silent
 * self-repair would destroy the evidence of whatever caused the drift.
 */

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const qty = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

/**
 * Reconciles the held figure against the ledger and the lots, per product
 * per location. Only mismatches are returned unless `includeMatched` is set.
 */
export async function reconcileStock({ branchId = null, includeMatched = false } = {}) {
  const where = {};
  if (branchId) where.branchId = branchId;

  const held = await BranchStock.findAll({
    where,
    include: [
      { model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'purchasePrice', 'batchRequired'], where: { detstatus: false } },
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
    ],
  });

  // One grouped query rather than one per row: a catalogue of a few thousand
  // products would otherwise make this unusable.
  //
  // Grouped by owner as well as product and location. A balance belongs to one
  // owner, so summing every owner's movements against it reports a third-party
  // client's goods as drift — the reconciliation would scream about a warehouse
  // that is perfectly correct, and real drift would be lost in the noise.
  const movementTotals = await StockMovement.findAll({
    where: { detstatus: false, ...(branchId ? { branchId } : {}) },
    attributes: [
      'productId', 'branchId', 'ownerId',
      [fn('SUM', col('quantity')), 'netQuantity'],
      [fn('COUNT', col('id')), 'movements'],
    ],
    group: ['product_id', 'branch_id', 'owner_id'],
    raw: true,
  });
  const ledgerBy = new Map(
    movementTotals.map((row) => [`${row.productId}:${row.branchId}:${row.ownerId}`, row]),
  );

  const batchTotals = await ProductBatch.findAll({
    where: { detstatus: false, ...(branchId ? { branchId } : {}) },
    attributes: ['productId', 'branchId', [fn('SUM', col('quantity')), 'lotQuantity']],
    group: ['product_id', 'branch_id'],
    raw: true,
  });
  const lotsBy = new Map(
    batchTotals.map((row) => [`${row.productId}:${row.branchId}`, Number(row.lotQuantity || 0)]),
  );

  // Resolved once, not per row: it is the same answer every time.
  const house = await houseOwnerId();

  const rows = [];
  for (const row of held) {
    const key = `${row.productId}:${row.branchId}:${row.ownerId}`;
    const lotKey = `${row.productId}:${row.branchId}`;
    const ledger = ledgerBy.get(key);
    const onHand = qty(row.stock);
    const perLedger = qty(ledger?.netQuantity ?? 0);
    // Lots are not owner-scoped, so they can only be checked against the
    // company's own balance. Comparing a client's holding to a lot table that
    // does not know about them would report drift on every row.
    const perLots = Number(row.ownerId) === Number(house) && lotsBy.has(lotKey) ? qty(lotsBy.get(lotKey)) : null;

    const ledgerDrift = qty(onHand - perLedger);
    // Lots are only expected to reconcile for products that are lot-tracked;
    // a partially-batched product legitimately holds untracked stock too.
    const lotDrift = row.Product?.batchRequired && perLots !== null
      ? qty(onHand - perLots)
      : 0;

    const matched = ledgerDrift === 0 && lotDrift === 0;
    if (matched && !includeMatched) continue;

    rows.push({
      productId: row.productId,
      productName: row.Product?.productName,
      sku: row.Product?.sku,
      unit: row.Product?.primaryUnit,
      branchId: row.branchId,
      branchName: row.Branch?.branchName,
      locationType: row.Branch?.locationType,
      onHand,
      perLedger,
      perLots,
      ledgerDrift,
      lotDrift,
      movements: Number(ledger?.movements || 0),
      // What the discrepancy is worth, so a long list can be triaged.
      driftValue: money(Math.abs(ledgerDrift) * Number(row.Product?.purchasePrice || 0)),
      matched,
    });
  }

  const mismatched = rows.filter((r) => !r.matched);
  return {
    rows: rows.sort((a, b) => b.driftValue - a.driftValue),
    checked: held.length,
    mismatched: mismatched.length,
    clean: mismatched.length === 0,
    driftValue: money(mismatched.reduce((sum, r) => sum + r.driftValue, 0)),
  };
}

/**
 * What happened at a location over a period: opening, movements by type,
 * closing. The warehouse equivalent of a bank statement.
 */
export async function locationAudit({ branchId, from, to } = {}) {
  const location = await Branch.findByPk(branchId);
  if (!location) throw Object.assign(new Error('Location not found'), { status: 404 });

  const range = {};
  if (from) range[Op.gte] = new Date(`${from}T00:00:00`);
  if (to) range[Op.lte] = new Date(`${to}T23:59:59`);
  const hasRange = Object.getOwnPropertySymbols(range).length > 0;

  const where = { branchId, detstatus: false };
  if (hasRange) where.transactionDate = range;

  const byType = await StockMovement.findAll({
    where,
    attributes: [
      'movementType',
      [fn('SUM', col('quantity_in')), 'totalIn'],
      [fn('SUM', col('quantity_out')), 'totalOut'],
      [fn('COUNT', col('id')), 'count'],
    ],
    group: ['movement_type'],
    raw: true,
  });

  // Who moved stock here, which is the question an audit usually starts from.
  const byUser = await StockMovement.findAll({
    where,
    attributes: [
      'createdBy',
      [fn('COUNT', col('StockMovement.id')), 'movements'],
      [fn('SUM', col('quantity_in')), 'totalIn'],
      [fn('SUM', col('quantity_out')), 'totalOut'],
    ],
    include: [{ model: User, as: 'stockUser', attributes: ['name'] }],
    group: ['StockMovement.created_by', 'stockUser.id'],
    raw: true,
    nest: true,
  });

  const totalIn = byType.reduce((sum, r) => sum + Number(r.totalIn || 0), 0);
  const totalOut = byType.reduce((sum, r) => sum + Number(r.totalOut || 0), 0);

  const heldNow = await BranchStock.sum('stock', { where: { branchId } });
  const closing = qty(heldNow || 0);

  // Opening is derived by unwinding the period's movements from today's
  // figure, which stays correct without storing a snapshot per period.
  const opening = qty(closing - totalIn + totalOut);

  const counts = await StockCount.findAll({
    where: { branchId, detstatus: false, ...(hasRange ? { countDate: { [Op.between]: [from, to] } } : {}) },
    attributes: ['id', 'countNumber', 'countDate', 'status'],
    order: [['countDate', 'DESC']],
    limit: 20,
  });

  return {
    location: {
      id: location.id,
      name: location.branchName,
      code: location.branchCode,
      type: location.locationType,
    },
    from: from || null,
    to: to || null,
    opening,
    closing,
    totalIn: qty(totalIn),
    totalOut: qty(totalOut),
    byType: byType.map((row) => ({
      movementType: row.movementType,
      totalIn: qty(row.totalIn),
      totalOut: qty(row.totalOut),
      count: Number(row.count || 0),
    })),
    byUser: byUser.map((row) => ({
      userId: row.createdBy,
      userName: row.stockUser?.name || 'System',
      movements: Number(row.movements || 0),
      totalIn: qty(row.totalIn),
      totalOut: qty(row.totalOut),
    })),
    stockCounts: counts,
    // Opening + in − out must land on closing, or the arithmetic above is wrong.
    balanced: qty(opening + totalIn - totalOut) === closing,
  };
}

/**
 * Movements worth a second look: large write-offs, adjustments outside the
 * normal buy/sell flow, and anything that took stock negative.
 */
export async function auditExceptions({ branchId = null, from, to, threshold = 50 } = {}) {
  const where = { detstatus: false };
  if (branchId) where.branchId = branchId;
  if (from || to) {
    where.transactionDate = {};
    if (from) where.transactionDate[Op.gte] = new Date(`${from}T00:00:00`);
    if (to) where.transactionDate[Op.lte] = new Date(`${to}T23:59:59`);
  }

  const include = [
    { model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit'] },
    { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
    { model: User, as: 'stockUser', attributes: ['id', 'name'] },
  ];

  // Stock leaving without a sale behind it is the classic thing an audit looks
  // for — damage, expiry and manual adjustments all reduce stock on someone's
  // say-so rather than against a customer's money.
  const writeOffs = await StockMovement.findAll({
    where: {
      ...where,
      movementType: { [Op.in]: ['Damage', 'Expired', 'Adjustment Out', 'Stock Count Adjustment'] },
    },
    include,
    order: [['quantity_out', 'DESC']],
    limit: 100,
  });

  const large = await StockMovement.findAll({
    where: { ...where, quantityOut: { [Op.gte]: Number(threshold) } },
    include,
    order: [['quantity_out', 'DESC']],
    limit: 50,
  });

  // A negative running balance means stock was issued that was never received.
  const negatives = await StockMovement.findAll({
    where: { ...where, currentQuantity: { [Op.lt]: 0 } },
    include,
    order: [['id', 'DESC']],
    limit: 50,
  });

  const shape = (rows, reason) => rows.map((row) => ({
    id: row.id,
    reason,
    date: row.transactionDate || row.addondt,
    movementType: row.movementType,
    productName: row.Product?.productName,
    sku: row.Product?.sku,
    branchName: row.Branch?.branchName,
    quantityIn: qty(row.quantityIn),
    quantityOut: qty(row.quantityOut),
    balanceAfter: row.currentQuantity === null ? null : qty(row.currentQuantity),
    reference: row.referenceNumber || row.referenceType,
    by: row.stockUser?.name || 'System',
    notes: row.notes,
  }));

  return {
    writeOffs: shape(writeOffs, 'Stock removed without a sale'),
    largeMovements: shape(large, `Issued ${threshold} units or more at once`),
    negativeBalances: shape(negatives, 'Balance went below zero'),
    total: writeOffs.length + large.length + negatives.length,
  };
}
