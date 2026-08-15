import { fn, col, Op } from 'sequelize';
import { Branch, BranchStock, Product, StockMovement } from '../models/index.js';
import { getConfig } from './config.service.js';
import { houseOwnerId } from './stockOwner.service.js';

/**
 * The stock engine.
 *
 * Stock lives per location — `branch_stock` is the authority, and both branches
 * and warehouses are rows in `branches`, so one table answers "how much is
 * there" for either kind of place. `products.stock` is kept as a mirror of the
 * total across locations so existing reports, low-stock checks and the
 * dashboard keep working without knowing locations exist.
 *
 * Nothing outside this file may write `branch_stock`. Every change goes through
 * `postStockTransaction`, which moves the quantity and writes the ledger row in
 * the same breath — a movement that changed stock without leaving a trace is
 * the one bug an inventory system cannot recover from.
 */

async function stockRow(productId, branchId, ownerId, transaction) {
  const [row] = await BranchStock.findOrCreate({
    where: { branchId, productId, ownerId },
    defaults: { branchId, productId, ownerId, stock: 0 },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  return row;
}

/**
 * Recomputes the product's mirrored total from its location rows.
 *
 * House stock only, deliberately. `products.stock` is what the catalogue, the
 * low-stock alert and the dashboard read, and all three mean "how much can we
 * sell". Counting a client's goods there would put a warehouse full of somebody
 * else's stock into your own availability, silence reorder alerts on goods you
 * have none of, and value another company's inventory as your asset.
 */
async function syncProductTotal(productId, transaction) {
  const house = await houseOwnerId(transaction);
  const total = await BranchStock.sum('stock', {
    where: { productId, ownerId: house },
    transaction,
  });
  await Product.update(
    { stock: Number(total || 0) },
    { where: { id: productId }, transaction },
  );
  return Number(total || 0);
}

/**
 * One owner's balance at one location. Defaults to the house, so every caller
 * that predates ownership keeps asking the same question and getting the same
 * answer.
 */
export async function getBranchStock(productId, branchId, transaction, ownerId = null) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const row = await BranchStock.findOne({
    where: { branchId, productId, ownerId: owner },
    transaction,
  });
  return Number(row?.stock || 0);
}

/**
 * Everything physically at a location, whoever owns it.
 *
 * This is the figure a stock-take produces — a counter walking the aisles
 * counts what is on the shelf and cannot see ownership — so reconciliation and
 * capacity checks use it, while anything about selling or valuing uses the
 * house balance instead.
 */
export async function getPhysicalStock(productId, branchId, transaction) {
  const total = await BranchStock.sum('stock', {
    where: { branchId, productId },
    transaction,
  });
  return Number(total || 0);
}

/**
 * Applies a signed change to one location's stock.
 *
 * Refuses to go negative unless the company has allowed it, or the caller has
 * already validated availability and says so with `allowNegative`.
 */
export async function adjustStock({ productId, branchId, delta, transaction, userId, allowNegative = false, ownerId = null }) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const row = await stockRow(productId, branchId, owner, transaction);
  const previous = Number(row.stock);
  const next = previous + Number(delta);

  if (!allowNegative && next < 0) {
    const { allowNegativeStock } = await getConfig();
    if (!allowNegativeStock) {
      throw Object.assign(
        new Error(`Insufficient stock at this location (have ${previous}, need ${Math.abs(delta)})`),
        { status: 409 },
      );
    }
  }

  await row.update({ stock: next, authlstedit: userId ?? null }, { transaction });
  await syncProductTotal(productId, transaction);
  return { previous, current: next };
}

/**
 * The one way stock is allowed to move: change the balance and write the
 * ledger row together, inside the caller's transaction.
 *
 * `quantity` is signed — positive receives, negative issues — which keeps the
 * call site honest about direction; the ledger stores both the signed figure
 * and the in/out split, plus the balance either side of the move.
 */
export async function postStockTransaction({
  productId,
  branchId,
  quantity,
  movementType,
  referenceType = null,
  referenceId = null,
  referenceNumber = null,
  batchId = null,
  serialNumber = null,
  unitCost = null,
  notes = null,
  transactionDate = null,
  transaction,
  userId = null,
  allowNegative = false,
  ownerId = null,
}) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty)) {
    throw Object.assign(new Error('Stock movement quantity must be a number'), { status: 400 });
  }
  if (qty === 0) return null;

  // Resolved once and used for both the balance and the ledger row, so the two
  // can never disagree about whose goods moved.
  const owner = ownerId ?? await houseOwnerId(transaction);

  const { previous, current } = await adjustStock({
    productId, branchId, delta: qty, transaction, userId, allowNegative, ownerId: owner,
  });

  // Goods that left the building must leave their shelves too.
  //
  // Some outbound paths pick from a bin first and have already done this; a
  // transfer dispatch, a damage write-off or a supplier return do not, and would
  // otherwise leave the bins claiming stock the location no longer holds. Doing
  // it here rather than in each of those callers is deliberate — the next
  // outbound path somebody writes would forget, and the resulting drift only
  // shows up weeks later at a stock count.
  //
  // Safe on every path because it clamps rather than deducts: where the pick
  // already reduced the bin, there is no excess and nothing happens.
  if (qty < 0) {
    const { releaseExcessFromBins } = await import('./binStock.service.js');
    await releaseExcessFromBins({ branchId, productId, ownerId: owner, transaction, userId });
  }

  const location = await Branch.findByPk(branchId, { transaction, attributes: ['id', 'locationType'] });

  return StockMovement.create({
    productId,
    branchId,
    ownerId: owner,
    locationType: location?.locationType || 'Branch',
    movementType,
    quantity: qty,
    quantityIn: qty > 0 ? qty : 0,
    quantityOut: qty < 0 ? -qty : 0,
    previousQuantity: previous,
    currentQuantity: current,
    unitCost,
    batchId,
    serialNumber,
    referenceType,
    referenceId,
    referenceNumber,
    transactionDate: transactionDate || new Date(),
    notes,
    createdBy: userId,
    authadd: userId,
  }, { transaction });
}

/**
 * Sets a location's stock to an absolute figure and logs the difference.
 * Used when a product is created or its stock is edited directly, where the
 * number given is the new truth rather than a delta.
 */
export async function setBranchStock({ productId, branchId, quantity, transaction, userId, movementType = 'Opening Stock', notes = null, ownerId = null }) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const row = await stockRow(productId, branchId, owner, transaction);
  const previous = Number(row.stock);
  const next = Number(quantity) || 0;
  await row.update({ stock: next, authlstedit: userId ?? null }, { transaction });
  const total = await syncProductTotal(productId, transaction);

  if (next !== previous) {
    const location = await Branch.findByPk(branchId, { transaction, attributes: ['id', 'locationType'] });
    await StockMovement.create({
      productId,
      branchId,
      ownerId: owner,
      locationType: location?.locationType || 'Branch',
      movementType,
      quantity: next - previous,
      quantityIn: next > previous ? next - previous : 0,
      quantityOut: next < previous ? previous - next : 0,
      previousQuantity: previous,
      currentQuantity: next,
      referenceType: 'Stock Set',
      transactionDate: new Date(),
      notes: notes || `Stock set to ${next}`,
      createdBy: userId,
      authadd: userId,
    }, { transaction });
  }

  return total;
}

/**
 * Checks availability for several lines at once before any of them are applied.
 *
 * Availability is per owner. A client's forty units sitting on the next shelf
 * do not make your sixty into a hundred, and a check that summed them would let
 * a bill be raised against goods that are not yours to sell.
 */
export async function assertAvailable(items, branchId, transaction, ownerId = null) {
  const { allowNegativeStock } = await getConfig();
  if (allowNegativeStock) return;

  const owner = ownerId ?? await houseOwnerId(transaction);

  for (const item of items) {
    const available = await getBranchStock(item.productId, branchId, transaction, owner);
    if (available < Number(item.quantity)) {
      const product = await Product.findByPk(item.productId, { transaction });
      throw Object.assign(
        new Error(`Insufficient stock for ${product?.productName || `product ${item.productId}`} (have ${available})`),
        { status: 409 },
      );
    }
  }
}

/**
 * Moves stock between two locations in one transaction, writing both sides of
 * the ledger. Used for a direct transfer; the multi-step transfer workflow
 * posts its own out and in legs at dispatch and receipt.
 */
export async function transferStock({
  productId, fromBranchId, toBranchId, quantity, transaction, userId,
  referenceType = 'Stock Transfer', referenceId = null, referenceNumber = null, batchId = null, unitCost = null,
  // Moving goods between your own buildings does not change who owns them, so
  // both legs carry the same owner. A transfer that changed ownership would be
  // a sale or a handover, not a transfer.
  ownerId = null,
}) {
  if (Number(fromBranchId) === Number(toBranchId)) {
    throw Object.assign(new Error('Source and destination locations must differ'), { status: 400 });
  }
  if (!(Number(quantity) > 0)) {
    throw Object.assign(new Error('Transfer quantity must be greater than zero'), { status: 400 });
  }

  const owner = ownerId ?? await houseOwnerId(transaction);

  await postStockTransaction({
    productId, branchId: fromBranchId, quantity: -Number(quantity), movementType: 'Transfer Out',
    referenceType, referenceId, referenceNumber, batchId, unitCost, transaction, userId, ownerId: owner,
  });
  await postStockTransaction({
    productId, branchId: toBranchId, quantity: Number(quantity), movementType: 'Transfer In',
    referenceType, referenceId, referenceNumber, batchId, unitCost, transaction, userId, ownerId: owner,
  });
}

/** Per-location breakdown for one product, used by the inventory screens. */
export async function stockByBranch(productId, ownerId = null) {
  const owner = ownerId ?? await houseOwnerId();
  return BranchStock.findAll({
    where: { productId, ownerId: owner },
    attributes: ['branchId', 'stock'],
    include: [{ model: Branch, attributes: ['branchName', 'branchCode', 'locationType'] }],
    order: [['branchId', 'ASC']],
  });
}

/**
 * Totals per location across all products, for location-level summaries.
 *
 * House goods only, matching what these summaries are read as — "how much stock
 * do we have here". `physical: true` gives what is actually in the building
 * instead, which is what a capacity or stock-take view wants.
 */
export async function branchTotals({ physical = false } = {}) {
  const where = physical ? {} : { ownerId: await houseOwnerId() };
  return BranchStock.findAll({
    where,
    attributes: ['branchId', [fn('SUM', col('stock')), 'totalStock']],
    group: ['branchId'],
    raw: true,
  });
}

/**
 * The stock ledger for a product, optionally at one location — the audit trail
 * that turns a number on screen back into the documents that produced it.
 */
export async function stockLedger({ productId, branchId, from, to, limit = 500, ownerId = null }) {
  const where = { detstatus: false };
  if (productId) where.productId = productId;
  if (branchId) where.branchId = branchId;
  // Unfiltered on purpose when no owner is named: the ledger is the audit
  // trail of what physically happened in the building, and hiding a client's
  // movements from it by default would make the record incomplete. Callers that
  // mean "our stock only" say so.
  if (ownerId) where.ownerId = Number(ownerId);
  if (from || to) {
    where.addondt = {};
    if (from) where.addondt[Op.gte] = new Date(from);
    if (to) where.addondt[Op.lte] = new Date(`${to}T23:59:59`);
  }

  return StockMovement.findAll({
    where,
    include: [
      { model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit'] },
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
    ],
    order: [['id', 'DESC']],
    limit: Number(limit) || 500,
  });
}

/**
 * Stock valuation at cost, per location and in total.
 *
 * House goods only unless an owner is named. This is the figure that reaches
 * the balance sheet, and a client's goods in your warehouse are not your asset
 * however much floor space they take up — valuing them would overstate the
 * company by the whole of somebody else's inventory.
 *
 * Passing an owner values that client's holding instead, which is what an
 * insurance declaration or a client statement needs; it is never added to
 * the company's own figure.
 */
export async function stockValuation(branchId = null, ownerId = null) {
  const where = { ownerId: ownerId ?? await houseOwnerId() };
  if (branchId) where.branchId = branchId;

  const rows = await BranchStock.findAll({
    where,
    include: [
      { model: Product, attributes: ['id', 'productName', 'sku', 'purchasePrice', 'sellingPrice'], where: { detstatus: false } },
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
    ],
  });

  let costValue = 0;
  let saleValue = 0;
  const items = rows.map((row) => {
    const qty = Number(row.stock || 0);
    const cost = Number(row.Product?.purchasePrice || 0) * qty;
    const sale = Number(row.Product?.sellingPrice || 0) * qty;
    costValue += cost;
    saleValue += sale;
    return {
      productId: row.productId,
      productName: row.Product?.productName,
      sku: row.Product?.sku,
      branchId: row.branchId,
      branchName: row.Branch?.branchName,
      locationType: row.Branch?.locationType,
      quantity: qty,
      costValue: cost,
      saleValue: sale,
    };
  });

  return { items, costValue, saleValue, potentialProfit: saleValue - costValue };
}
