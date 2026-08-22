import { fn, col, Op } from 'sequelize';
import { Branch, BranchStock, Product, StockMovement } from '../../models/index.js';
import { getConfig } from '../platform/config.service.js';
import { houseOwnerId } from '../warehouse/stockOwner.service.js';

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

/**
 * The balance row for one product, at one location, for one owner, in one
 * packaged size.
 *
 * `variantId` is 0 for the product's loose or plain stock and the variant's id
 * for a packaged size, which is what keeps the 100g pouches, the 250g pouches
 * and the open bucket as three balances rather than one blended number. It
 * defaults to 0 so that every existing caller — fourteen controllers that have
 * never heard of a variant — keeps addressing exactly the row it always did.
 */
async function stockRow(productId, branchId, ownerId, transaction, variantId = 0) {
  const [row] = await BranchStock.findOrCreate({
    where: { branchId, productId, ownerId, variantId: variantId || 0 },
    defaults: { branchId, productId, ownerId, variantId: variantId || 0, stock: 0 },
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
 *
 * Packaged sizes are converted to base units before being added, never summed
 * raw. Adding 250 pouches to 8,890 grams gives 9,140 of nothing; multiplying
 * each pouch by what it contains gives the quantity of the actual substance
 * held, which is the only reading of "how much do we have" that survives being
 * asked about a product sold four ways. A variant with no pack size — a colour
 * or a garment size — counts as one unit each, which is what it is.
 */
async function syncProductTotal(productId, transaction) {
  const house = await houseOwnerId(transaction);
  const rows = await BranchStock.findAll({
    where: { productId, ownerId: house },
    transaction,
  });

  let currentTotal = 0;
  if (rows.length) {
    const variantIds = [...new Set(
      rows.map((row) => Number(row.variantId)).filter((id) => id > 0),
    )];

    const packSizeById = new Map();
    if (variantIds.length) {
      const { ProductVariant } = await import('../../models/index.js');
      const variants = await ProductVariant.findAll({
        where: { id: variantIds },
        attributes: ['id', 'packSize'],
        transaction,
      });
      for (const variant of variants) {
        packSizeById.set(Number(variant.id), variant.packSize === null ? 1 : Number(variant.packSize));
      }
    }

    for (const row of rows) {
      const variantId = Number(row.variantId);
      const multiplier = variantId > 0 ? (packSizeById.get(variantId) ?? 1) : 1;
      currentTotal += Number(row.stock) * multiplier;
    }
    currentTotal = Math.round(currentTotal * 10_000) / 10_000;
  }
  
  await Product.update(
    { stock: currentTotal },
    { where: { id: productId }, transaction },
  );

  // Trigger low stock email and SMS if applicable
  try {
    const product = await Product.findByPk(productId, { transaction });
    if (product && currentTotal <= product.lowStockThreshold) {
      const { Company } = await import('../../models/index.js');
      const company = await Company.findOne({ transaction });
      
      const emailPromise = import('../platform/email.service.js').then(({ sendLowStockAlert }) => {
        return sendLowStockAlert(product).catch(err => console.error('Failed to send low stock alert email:', err));
      });

      let smsPromise = Promise.resolve();
      if (company?.mobile) {
        smsPromise = import('../platform/sms.service.js').then(({ sendLowStockSMS }) => {
          return sendLowStockSMS(company.mobile, product.productName, currentTotal).catch(err => console.error('Failed to send low stock SMS:', err));
        });
      }

      await Promise.all([emailPromise, smsPromise]);
    }
  } catch (err) {
    console.error('Failed to check low stock for alerts:', err);
  }

  return currentTotal;
}

/**
 * One owner's balance at one location. Defaults to the house, so every caller
 * that predates ownership keeps asking the same question and getting the same
 * answer.
 */
export async function getBranchStock(productId, branchId, transaction, ownerId = null, variantId = 0) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const row = await BranchStock.findOne({
    where: { branchId, productId, ownerId: owner, variantId: variantId || 0 },
    transaction,
  });
  return Number(row?.stock || 0);
}

/**
 * The loose balance and every packaged size, for one product at one location.
 *
 * The shape the Product 360 view and the till both need: "250 pouches of 100g,
 * 120 of 250g, and 8,890g loose" is four numbers that must never be added
 * together, and a caller given a single total will add them together.
 */
export async function stockByVariant(productId, branchId, transaction = null, ownerId = null) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const rows = await BranchStock.findAll({
    where: { branchId, productId, ownerId: owner },
    transaction,
  });

  const bulk = rows.find((row) => Number(row.variantId) === 0);
  return {
    bulk: {
      stock: Number(bulk?.stock || 0),
      reserved: Number(bulk?.reservedQuantity || 0),
      available: Number(bulk?.stock || 0) - Number(bulk?.reservedQuantity || 0),
    },
    packaged: rows
      .filter((row) => Number(row.variantId) > 0)
      .map((row) => ({
        variantId: Number(row.variantId),
        stock: Number(row.stock),
        reserved: Number(row.reservedQuantity || 0),
        available: Number(row.stock) - Number(row.reservedQuantity || 0),
      })),
  };
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
 * For outbound moves (delta < 0) the available amount is stock − reservedQuantity;
 * only that figure is checked — reserved stock is already spoken for.
 */
export async function adjustStock({
  productId, branchId, delta, transaction, userId,
  allowNegative = false, ownerId = null, variantId = 0,
}) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const row = await stockRow(productId, branchId, owner, transaction, variantId);
  const previous = Number(row.stock);
  const reserved = Number(row.reservedQuantity || 0);
  const available = previous - reserved;
  const next = previous + Number(delta);

  if (!allowNegative && Number(delta) < 0 && available < Math.abs(Number(delta))) {
    const { allowNegativeStock } = await getConfig();
    if (!allowNegativeStock) {
      throw Object.assign(
        new Error(`Insufficient stock at this location (have ${available} available, need ${Math.abs(delta)})`),
        { status: 409 },
      );
    }
  }

  await row.update({ stock: next, authlstedit: userId ?? null }, { transaction });
  await syncProductTotal(productId, transaction);
  return { previous, current: next };
}

/**
 * Locks a quantity against confirmed Sales Orders.
 *
 * Checks that available (stock − reservedQuantity) ≥ qty, then increments
 * reservedQuantity. Must run inside a transaction with a row lock so that two
 * concurrent confirmations for the same product cannot both succeed when only
 * one unit remains.
 */
export async function reserveStock({ productId, branchId, quantity, transaction, userId = null, ownerId = null }) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const row = await stockRow(productId, branchId, owner, transaction);
  const stock = Number(row.stock);
  const reserved = Number(row.reservedQuantity || 0);
  const available = stock - reserved;
  const qty = Number(quantity);

  if (qty <= 0) return;

  if (available < qty) {
    const product = await Product.findByPk(productId, { transaction, attributes: ['productName'] });
    throw Object.assign(
      new Error(`Insufficient stock for ${product?.productName || `product ${productId}`} (have ${available} available, need ${qty})`),
      { status: 409 },
    );
  }

  await row.update({
    reservedQuantity: reserved + qty,
    authlstedit: userId ?? null,
  }, { transaction });
}

/**
 * Releases a previously-made reservation.
 *
 * Used when a Sales Order is cancelled: the stock was never consumed so the
 * reservation simply disappears. Clamps at zero — an over-release is a bug
 * but should never leave the database in a negative state.
 */
export async function releaseReservation({ productId, branchId, quantity, transaction, userId = null, ownerId = null }) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const row = await stockRow(productId, branchId, owner, transaction);
  const reserved = Number(row.reservedQuantity || 0);
  const qty = Number(quantity);
  if (qty <= 0 || reserved <= 0) return;
  const next = Math.max(0, reserved - qty);
  await row.update({ reservedQuantity: next, authlstedit: userId ?? null }, { transaction });
}

/**
 * Consumes a reservation on invoice confirmation.
 *
 * Decrements both `stock` (physical unit leaves the building) and
 * `reservedQuantity` (the hold is consumed). Writes a ledger row.
 * If there is no prior reservation (invoice not linked to an SO), it falls back
 * to a plain availability check on the unreserved balance.
 */
export async function deductReserved({
  productId, branchId, quantity, transaction, userId = null, ownerId = null,
  movementType = 'Sale', referenceType = null, referenceId = null, referenceNumber = null,
  unitCost = null, notes = null, transactionDate = null, hasReservation = false,
}) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const row = await stockRow(productId, branchId, owner, transaction);
  const stock = Number(row.stock);
  const reserved = Number(row.reservedQuantity || 0);
  const qty = Number(quantity);

  if (hasReservation) {
    // The SO already locked this quantity — just consume it.
    const newReserved = Math.max(0, reserved - qty);
    if (stock < qty) {
      // Should never happen if reserveStock was called, but guard it.
      throw Object.assign(new Error('Stock deduction exceeds physical stock'), { status: 409 });
    }
    await row.update({
      stock: stock - qty,
      reservedQuantity: newReserved,
      authlstedit: userId ?? null,
    }, { transaction });
  } else {
    // Plain availability check on unreserved balance.
    const available = stock - reserved;
    if (available < qty) {
      const product = await Product.findByPk(productId, { transaction, attributes: ['productName'] });
      throw Object.assign(
        new Error(`Insufficient stock for ${product?.productName || `product ${productId}`} (have ${available} available, need ${qty})`),
        { status: 409 },
      );
    }
    await row.update({ stock: stock - qty, authlstedit: userId ?? null }, { transaction });
  }

  await syncProductTotal(productId, transaction);

  // Goods that left the building must leave their shelves too.
  //
  // The same clamp postStockTransaction applies, and here for the same reason:
  // billing an order consumes its reservation and drops the location balance,
  // but nobody walked to a bin to do it, so the bins would go on claiming stock
  // the location no longer holds. Bin quantities are a sub-allocation of the
  // location, never a second copy of it, and the enforcement belongs on the
  // path that moves the balance rather than in each caller.
  const { releaseExcessFromBins } = await import('../warehouse/binStock.service.js');
  await releaseExcessFromBins({ branchId, productId, ownerId: owner, transaction, userId });

  // Ledger row.
  const location = await Branch.findByPk(branchId, { transaction, attributes: ['id', 'locationType'] });
  return StockMovement.create({
    productId, branchId, ownerId: owner, locationType: location?.locationType || 'Branch',
    movementType, quantity: -qty, quantityIn: 0, quantityOut: qty,
    previousQuantity: stock, currentQuantity: stock - qty,
    unitCost, referenceType, referenceId, referenceNumber,
    transactionDate: transactionDate || new Date(),
    notes, createdBy: userId, authadd: userId,
  }, { transaction });
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
  // 0 addresses the product's loose or plain stock; a variant id addresses one
  // packaged size. Callers that predate variants pass nothing and keep moving
  // exactly the balance they always moved.
  variantId = 0,
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
    productId, branchId, delta: qty, transaction, userId, allowNegative, ownerId: owner, variantId,
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
  //
  // Bins hold loose stock, so this applies to the base balance only. A packaged
  // size is a sealed pack on a shelf and is not tracked bin by bin.
  if (qty < 0 && !variantId) {
    const { releaseExcessFromBins } = await import('../warehouse/binStock.service.js');
    await releaseExcessFromBins({ branchId, productId, ownerId: owner, transaction, userId });
  }

  const location = await Branch.findByPk(branchId, { transaction, attributes: ['id', 'locationType'] });

  return StockMovement.create({
    productId,
    branchId,
    ownerId: owner,
    variantId: variantId || 0,
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
 * Availability = stock − reservedQuantity. A client's reserved units sitting on
 * the next shelf do not count toward your available balance.
 */
export async function assertAvailable(items, branchId, transaction, ownerId = null) {
  const { allowNegativeStock } = await getConfig();
  if (allowNegativeStock) return;

  const owner = ownerId ?? await houseOwnerId(transaction);

  for (const item of items) {
    // `variantId` has to be in the where clause, not left out. A product with
    // packs has several balance rows — one loose, one per packaged size — and
    // a query that names only the product matches whichever the database
    // returns first. That reads as "checked" and answers about a different
    // shelf. `0` is the loose balance, which is what every caller meant back
    // when it was the only row there could be.
    const variantId = Number(item.variantId || 0);
    const row = await BranchStock.findOne({
      where: { branchId, productId: item.productId, ownerId: owner, variantId },
      transaction,
    });
    const stock = Number(row?.stock || 0);
    const reserved = Number(row?.reservedQuantity || 0);
    const available = stock - reserved;
    if (available < Number(item.quantity)) {
      const product = await Product.findByPk(item.productId, { transaction });
      const what = variantId
        ? `${product?.productName || `product ${item.productId}`} (pack)`
        : product?.productName || `product ${item.productId}`;
      throw Object.assign(
        new Error(`Insufficient stock for ${what} (have ${available} available, ${reserved} reserved)`),
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
