import { Op, fn, col } from 'sequelize';
import { ProductBatch } from '../models/index.js';

/**
 * Seed lots sit alongside branch stock rather than replacing it.
 *
 * `branch_stock` stays the authority for how much of a product a branch holds;
 * these functions say which lots that quantity is made up of. Batch tracking is
 * therefore optional per product — a product with no lots recorded bills exactly
 * as it did before, which matters because the catalogue predates this feature.
 */

const today = () => new Date().toISOString().slice(0, 10);

/** Live lots for a product at a branch, oldest expiry first. */
export async function batchesFor(productId, branchId, transaction) {
  return ProductBatch.findAll({
    where: { productId, branchId, detstatus: false },
    // Nulls last: a lot with no expiry is used only once the dated ones are gone.
    order: [
      [fn('ISNULL', col('expiry_date')), 'ASC'],
      ['expiryDate', 'ASC'],
      ['id', 'ASC'],
    ],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
}

/** True when this product has any lots recorded at this branch. */
export async function hasBatches(productId, branchId, transaction) {
  const count = await ProductBatch.count({
    where: { productId, branchId, detstatus: false },
    transaction,
  });
  return count > 0;
}

/**
 * Works out which lots a sale should come from.
 *
 * With an explicit `batchId` the whole quantity comes from that lot. Otherwise
 * lots are consumed first-expiry-first, so the stock closest to being unsellable
 * goes out of the door first.
 *
 * Returns [] when the product has no lots — untracked products keep working.
 */
export async function allocate({ productId, branchId, quantity, batchId, transaction, allowExpired = false }) {
  const wanted = Number(quantity);
  const available = await batchesFor(productId, branchId, transaction);
  if (!available.length) return [];

  const usable = batchId
    ? available.filter((b) => b.id === Number(batchId))
    : available.filter((b) => allowExpired || !b.expiryDate || b.expiryDate >= today());

  if (batchId && !usable.length) {
    throw Object.assign(new Error('That batch is not available at this branch'), { status: 400 });
  }

  const allocations = [];
  let outstanding = wanted;
  for (const batch of usable) {
    if (outstanding <= 0) break;
    const take = Math.min(Number(batch.quantity), outstanding);
    if (take <= 0) continue;
    allocations.push({ batch, quantity: take });
    outstanding -= take;
  }

  if (outstanding > 0) {
    const held = usable.reduce((sum, b) => sum + Number(b.quantity), 0);
    const expiredHeld = available
      .filter((b) => b.expiryDate && b.expiryDate < today())
      .reduce((sum, b) => sum + Number(b.quantity), 0);
    const hint = !allowExpired && expiredHeld > 0
      ? ` (${expiredHeld} more is past its expiry date)`
      : '';
    throw Object.assign(
      new Error(`Only ${held} available in usable batches, ${wanted} requested${hint}`),
      { status: 409 },
    );
  }
  return allocations;
}

/** Applies allocations to the lots, reducing (or with a negative sign, restoring) them. */
export async function consume(allocations, { transaction, userId, sign = -1 }) {
  for (const { batch, quantity } of allocations) {
    const next = Number(batch.quantity) + sign * Number(quantity);
    await batch.update(
      { quantity: Math.max(next, 0), authlstedit: userId ?? null },
      { transaction },
    );
  }
}

/** Puts quantity back into the exact lots a cancelled invoice took it from. */
export async function restoreFromItems(items, { transaction, userId }) {
  for (const item of items) {
    if (!item.batchId) continue;
    const batch = await ProductBatch.findByPk(item.batchId, { transaction });
    if (!batch) continue;
    await batch.update(
      { quantity: Number(batch.quantity) + Number(item.quantity), authlstedit: userId ?? null },
      { transaction },
    );
  }
}

/**
 * Lots at or past their expiry date, plus those due within `days`.
 * Drives the dashboard warning and the batch screen's filters.
 */
export async function expiringBatches({ days = 60, branchId = null, includeEmpty = false } = {}) {
  const limit = new Date();
  limit.setDate(limit.getDate() + Number(days));

  const where = {
    detstatus: false,
    expiryDate: { [Op.ne]: null, [Op.lte]: limit.toISOString().slice(0, 10) },
  };
  if (branchId) where.branchId = branchId;
  if (!includeEmpty) where.quantity = { [Op.gt]: 0 };

  return ProductBatch.findAll({ where, order: [['expiryDate', 'ASC']] });
}

/** Total quantity held in live lots, used to reconcile against branch stock. */
export async function batchTotal(productId, branchId, transaction) {
  const total = await ProductBatch.sum('quantity', {
    where: { productId, branchId, detstatus: false },
    transaction,
  });
  return Number(total || 0);
}
