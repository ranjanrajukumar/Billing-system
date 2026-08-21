import { sequelize, Product, ProductVariant } from '../models/index.js';
import { postStockTransaction, getBranchStock, stockByVariant } from './stock.service.js';
import { resolveSaleTarget, toBaseQty, fromBaseQty, toStoredQty } from './uom.service.js';
import { drawFromContainers, returnToContainer } from './container.service.js';
import { houseOwnerId } from './stockOwner.service.js';

/**
 * The single door into inventory.
 *
 * Every module that moves stock — the till, receiving, transfers, returns,
 * counts, adjustments, damage, repackaging — comes through `applyMovement`. The
 * point is not tidiness. Each of those modules has its own idea of a quantity:
 * the till says "1kg", receiving says "5 buckets", a count says "8890". If each
 * converts for itself, they drift, and a drifted conversion is invisible — a
 * receipt that posts ten times too much stock looks exactly like a receipt.
 *
 * The steps are always the same and always in this order:
 *
 *   1. resolve the product
 *   2. resolve the variant, when a packaged size was named
 *   3. resolve the unit and convert the quantity to base units
 *   4. check availability, unless negative stock is allowed
 *   5. move the balance and write the ledger row, atomically
 *   6. update the physical vessels, where they are tracked
 *   7. return the new balance in both base and readable units
 *
 * Steps 4 and 5 are one database transaction with the balance row locked, so
 * two tills selling the last kilo cannot both succeed.
 */

const OUTBOUND = new Set(['Sale', 'Transfer Out', 'Damage', 'Adjustment Out', 'Purchase Return']);

/**
 * Moves stock.
 *
 * `quantity` is always positive; `direction` says which way. That is
 * deliberate: a till sending a negative quantity by accident is a refund, and
 * making direction explicit means the mistake cannot be made silently.
 */
export async function applyMovement({
  productId,
  branchId,
  quantity,
  unitCode = null,
  variantId = null,
  direction = 'out',
  movementType = 'Sale',
  ownerId = null,
  batchId = null,
  serialNumber = null,
  unitCost = null,
  referenceType = null,
  referenceId = null,
  referenceNumber = null,
  notes = null,
  containerId = null,
  allowNegative = false,
  // 'sell' or 'purchase' restricts the movement to units configured for that
  // purpose. Left unset for everything except sales — see where it is used.
  intent = null,
  transaction = null,
  userId = null,
}) {
  const run = async (tx) => {
    // ---- 1. Product ----
    const product = await Product.findByPk(productId, { transaction: tx });
    if (!product || product.detstatus) {
      throw Object.assign(new Error(`Product ${productId} not found`), { status: 404 });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw Object.assign(
        new Error('Quantity must be a positive number; use direction to say in or out'),
        { status: 400 },
      );
    }

    // ---- 2 & 3. Variant, unit, conversion ----
    // A sale is held to the units the product is actually sold in; other
    // movements are not, because an adjustment counted in buckets or a return
    // of goods bought by the bucket are both ordinary and both legitimate.
    const target = await resolveSaleTarget({
      product, variantId, unitCode, quantity: qty, transaction: tx,
      intent: intent ?? (movementType === 'Sale' ? 'sell' : null),
    });

    const owner = ownerId ?? await houseOwnerId(tx);
    const signed = direction === 'in' ? target.baseQty : -target.baseQty;

    // ---- 4 & 5. Balance and ledger, atomically ----
    const movement = await postStockTransaction({
      productId: product.id,
      branchId,
      variantId: target.variantId,
      quantity: signed,
      movementType,
      referenceType,
      referenceId,
      referenceNumber,
      batchId,
      serialNumber,
      unitCost,
      // The ledger keeps what the user actually typed alongside the converted
      // figure, so "5 buckets" is still readable years later when nobody
      // remembers what a bucket of this product was.
      notes: buildNote({ notes, target, product }),
      transaction: tx,
      userId,
      allowNegative,
      ownerId: owner,
    });

    // ---- 6. Physical vessels ----
    // Only for loose stock, and only where the product asks for it.
    let containers = null;
    if (product.trackContainers && target.variantId === 0) {
      if (direction === 'out') {
        containers = await drawFromContainers({
          productId: product.id, branchId, ownerId: owner,
          quantity: target.baseQty, transaction: tx, userId,
        });
      } else if (containerId) {
        await returnToContainer({ containerId, quantity: target.baseQty, transaction: tx, userId });
        containers = { returned: target.baseQty, containerId };
      }
    }

    // ---- 7. The new balance, both ways ----
    const balance = await getBranchStock(product.id, branchId, tx, owner, target.variantId);
    const readable = target.variantId === 0
      ? await fromBaseQty({ product, baseQty: balance, transaction: tx })
      : { baseQty: balance, baseUnit: 'pack', readable: { quantity: balance, unitCode: 'pack' }, label: `${balance} packs` };

    return {
      movementId: movement?.id ?? null,
      productId: product.id,
      branchId,
      kind: target.kind,
      variantId: target.variantId || null,
      variantName: target.variantName,
      entered: { quantity: qty, unit: target.enteredUnit || unitCode || target.stockUnit },
      baseQty: target.baseQty,
      baseUnit: target.stockUnit,
      direction,
      balance: toStoredQty(balance),
      balanceLabel: readable.label,
      containers,
    };
  };

  // Joins the caller's transaction when there is one — an invoice moves several
  // lines and posts a ledger entry, and a partial success there is worse than a
  // failure. Opens its own only when called standalone.
  return transaction ? run(transaction) : sequelize.transaction(run);
}

/** Records what the user actually entered, so the ledger stays readable. */
function buildNote({ notes, target, product }) {
  if (target.kind === 'Packaged') {
    const parts = [`${target.variantName} pack`];
    if (notes) parts.push(notes);
    return parts.join(' — ').slice(0, 255);
  }

  const converted = target.enteredUnit && target.enteredUnit !== target.stockUnit
    ? `${target.enteredQty} ${target.enteredUnit} = ${target.baseQty} ${target.stockUnit}`
    : null;

  const parts = [converted, notes].filter(Boolean);
  return parts.length ? parts.join(' — ').slice(0, 255) : null;
}

/**
 * Moves stock between locations as one operation.
 *
 * Both legs in one transaction: stock that has left one place and not arrived
 * at another is the state an inventory system must never be able to reach, and
 * two separate calls can be interrupted between them.
 */
export async function transferBetweenLocations({
  productId, fromBranchId, toBranchId, quantity, unitCode = null, variantId = null,
  ownerId = null, referenceType = 'Transfer', referenceId = null, referenceNumber = null,
  notes = null, transaction = null, userId = null,
}) {
  if (fromBranchId === toBranchId) {
    throw Object.assign(new Error('Source and destination must be different locations'), { status: 400 });
  }

  const run = async (tx) => {
    const out = await applyMovement({
      productId, branchId: fromBranchId, quantity, unitCode, variantId,
      direction: 'out', movementType: 'Transfer Out', ownerId,
      referenceType, referenceId, referenceNumber, notes,
      transaction: tx, userId,
    });

    const into = await applyMovement({
      productId, branchId: toBranchId, quantity, unitCode, variantId,
      direction: 'in', movementType: 'Transfer In', ownerId,
      referenceType, referenceId, referenceNumber, notes,
      transaction: tx, userId,
    });

    return { from: out, to: into, baseQty: out.baseQty };
  };

  return transaction ? run(transaction) : sequelize.transaction(run);
}

/**
 * Breaks loose stock down into packs, or packs back into loose stock.
 *
 * The only sanctioned bridge between the two balances, and the reason
 * `packSize` exists on a variant. Both legs post in one transaction so the
 * substance is conserved: 10 pouches of 100g leaving the bucket is exactly
 * 1,000g, and the ledger shows both halves of the same event rather than an
 * unexplained write-off followed by an unexplained receipt.
 */
export async function repackage({
  productId, branchId, variantId, packCount, toPacks = true,
  ownerId = null, transaction = null, userId = null, notes = null,
}) {
  const run = async (tx) => {
    const variant = await ProductVariant.findOne({
      where: { id: variantId, productId, detstatus: false },
      transaction: tx,
    });
    if (!variant) throw Object.assign(new Error('Pack size not found for this product'), { status: 404 });

    const packSize = Number(variant.packSize);
    if (!(packSize > 0)) {
      throw Object.assign(
        new Error(`${variant.variantName} has no pack size, so it cannot be filled from loose stock`),
        { status: 400 },
      );
    }

    const packs = Number(packCount);
    if (!Number.isFinite(packs) || packs <= 0) {
      throw Object.assign(new Error('Pack count must be greater than zero'), { status: 400 });
    }

    const looseQty = toStoredQty(packs * packSize);
    const reference = `Repackage ${packs} × ${variant.variantName}`;

    // Loose stock out, packs in — or the reverse when opening packs back up.
    const loose = await applyMovement({
      productId, branchId, quantity: looseQty, direction: toPacks ? 'out' : 'in',
      movementType: toPacks ? 'Adjustment Out' : 'Adjustment In',
      ownerId, referenceType: 'Repackage', referenceNumber: reference,
      notes: notes || reference, transaction: tx, userId,
    });

    const packed = await applyMovement({
      productId, branchId, quantity: packs, variantId: variant.id,
      direction: toPacks ? 'in' : 'out',
      movementType: toPacks ? 'Adjustment In' : 'Adjustment Out',
      ownerId, referenceType: 'Repackage', referenceNumber: reference,
      notes: notes || reference, transaction: tx, userId,
    });

    return { loose, packed, packSize, looseQty, packs };
  };

  return transaction ? run(transaction) : sequelize.transaction(run);
}

/**
 * Everything held for one product at one location: loose, and every pack size,
 * with both the exact base figure and a readable one.
 */
export async function inventorySnapshot({ productId, branchId, ownerId = null }) {
  const product = await Product.findByPk(productId);
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

  const owner = ownerId ?? await houseOwnerId(null);
  const [balances, variants] = await Promise.all([
    stockByVariant(productId, branchId, null, owner),
    ProductVariant.findAll({ where: { productId, detstatus: false }, order: [['displayOrder', 'ASC']] }),
  ]);

  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const bulkReadable = await fromBaseQty({ product, baseQty: balances.bulk.stock });

  return {
    productId,
    branchId,
    stockMode: product.stockMode,
    bulk: {
      ...balances.bulk,
      baseUnit: bulkReadable.baseUnit,
      // Both figures, always. Reports need the exact quantity and shelf labels
      // need the readable one, and rounding for display must never leak into a
      // balance.
      label: bulkReadable.label,
    },
    packaged: balances.packaged.map((row) => {
      const variant = variantById.get(row.variantId);
      return {
        ...row,
        variantName: variant?.variantName ?? `Variant ${row.variantId}`,
        sku: variant?.sku ?? null,
        barcode: variant?.barcode ?? null,
        packSize: variant?.packSize === null || variant?.packSize === undefined ? null : Number(variant.packSize),
        label: `${row.stock} × ${variant?.variantName ?? 'pack'}`,
      };
    }),
  };
}

export { toBaseQty, fromBaseQty };
