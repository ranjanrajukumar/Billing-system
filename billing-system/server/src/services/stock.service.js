import { fn, col } from 'sequelize';
import { BranchStock, Product } from '../models/index.js';

/**
 * Stock lives per branch. `products.stock` is kept as a mirror of the total
 * across branches so existing reports, low-stock checks and the dashboard keep
 * working without knowing branches exist.
 */

async function stockRow(productId, branchId, transaction) {
  const [row] = await BranchStock.findOrCreate({
    where: { branchId, productId },
    defaults: { branchId, productId, stock: 0 },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  return row;
}

/** Recomputes the product's mirrored total from its branch rows. */
async function syncProductTotal(productId, transaction) {
  const total = await BranchStock.sum('stock', { where: { productId }, transaction });
  await Product.update(
    { stock: Number(total || 0) },
    { where: { id: productId }, transaction },
  );
  return Number(total || 0);
}

export async function getBranchStock(productId, branchId, transaction) {
  const row = await BranchStock.findOne({ where: { branchId, productId }, transaction });
  return Number(row?.stock || 0);
}

/**
 * Applies a signed change to one branch's stock.
 * Pass `allowNegative` only where the caller has already validated availability.
 */
export async function adjustStock({ productId, branchId, delta, transaction, userId, allowNegative = false }) {
  const row = await stockRow(productId, branchId, transaction);
  const next = Number(row.stock) + Number(delta);

  if (!allowNegative && next < 0) {
    throw Object.assign(
      new Error(`Insufficient stock at this branch (have ${row.stock}, need ${Math.abs(delta)})`),
      { status: 409 },
    );
  }

  await row.update({ stock: next, authlstedit: userId ?? null }, { transaction });
  await syncProductTotal(productId, transaction);
  return next;
}

/**
 * Sets a branch's stock to an absolute figure. Used when a product is created
 * or its stock is edited directly, where the number given is the new truth
 * rather than a delta.
 */
export async function setBranchStock({ productId, branchId, quantity, transaction, userId }) {
  const row = await stockRow(productId, branchId, transaction);
  await row.update({ stock: Number(quantity) || 0, authlstedit: userId ?? null }, { transaction });
  return syncProductTotal(productId, transaction);
}

/** Checks availability for several lines at once before any of them are applied. */
export async function assertAvailable(items, branchId, transaction) {
  for (const item of items) {
    const available = await getBranchStock(item.productId, branchId, transaction);
    if (available < Number(item.quantity)) {
      const product = await Product.findByPk(item.productId, { transaction });
      throw Object.assign(
        new Error(`Insufficient stock for ${product?.productName || `product ${item.productId}`} (have ${available})`),
        { status: 409 },
      );
    }
  }
}

/** Moves stock between branches in one transaction. */
export async function transferStock({ productId, fromBranchId, toBranchId, quantity, transaction, userId }) {
  if (Number(fromBranchId) === Number(toBranchId)) {
    throw Object.assign(new Error('Source and destination branches must differ'), { status: 400 });
  }
  if (!(Number(quantity) > 0)) {
    throw Object.assign(new Error('Transfer quantity must be greater than zero'), { status: 400 });
  }

  await adjustStock({ productId, branchId: fromBranchId, delta: -Number(quantity), transaction, userId });
  await adjustStock({ productId, branchId: toBranchId, delta: Number(quantity), transaction, userId });
}

/** Per-branch breakdown for one product, used by the inventory screens. */
export async function stockByBranch(productId) {
  return BranchStock.findAll({
    where: { productId },
    attributes: ['branchId', 'stock'],
    order: [['branchId', 'ASC']],
    raw: true,
  });
}

/** Totals per branch across all products, for branch-level inventory summaries. */
export async function branchTotals() {
  return BranchStock.findAll({
    attributes: ['branchId', [fn('SUM', col('stock')), 'totalStock']],
    group: ['branchId'],
    raw: true,
  });
}
