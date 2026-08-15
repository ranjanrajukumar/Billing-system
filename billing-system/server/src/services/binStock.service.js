import { Op, fn, col } from 'sequelize';
import {
  BinStock, BranchStock, Product, ProductBatch, PutAwayRule, StockOwner, WarehouseBin,
} from '../models/index.js';
import { houseOwnerId } from './stockOwner.service.js';
import { orderByRoute } from '../utils/pickRoute.js';

/**
 * Where in the building the stock is.
 *
 * Bin quantities are a sub-allocation of location stock, never a second copy of
 * it. Nothing in this file touches `branch_stock` — putting stock away, moving
 * it between bins and picking it are all rearrangements *within* a location, so
 * the location total is unchanged by definition. Only the stock engine moves
 * the total, and only when goods genuinely enter or leave the building.
 *
 * That separation is what makes bins optional: a location with no bins has no
 * rows here, every function below returns nothing, and the rest of the
 * application neither knows nor cares.
 */

const qty = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

/** Whether this location uses bins at all. Everything else keys off this. */
export async function usesBins(branchId, transaction) {
  const count = await WarehouseBin.count({
    where: { branchId, detstatus: false, isActive: true },
    transaction,
  });
  return count > 0;
}

/** Total binned quantity for a product at a location. */
export async function binnedQty(productId, branchId, transaction, ownerId = null) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const total = await BinStock.sum('quantity', {
    where: { productId, branchId, ownerId: owner, detstatus: false },
    transaction,
  });
  return qty(total || 0);
}

/**
 * Stock that has arrived at the location but is not in a bin yet — the
 * receiving bay. This is what put-away works through.
 */
export async function unassignedQty(productId, branchId, transaction, ownerId = null) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  // Per owner on both sides. Comparing one owner's binned quantity against the
  // location's combined total would report a client's goods as room to put away
  // more of ours, and vice versa.
  const held = await BranchStock.findOne({
    where: { productId, branchId, ownerId: owner },
    transaction,
  });
  return qty(Number(held?.stock || 0) - await binnedQty(productId, branchId, transaction, owner));
}

/** Everything waiting to be put away at a location. */
export async function putAwayQueue(branchId) {
  // Deliberately across every owner. The storeman puts away whatever arrived
  // today, and a client's pallet on the receiving bay is just as much in the
  // way as our own — hiding it would leave work nobody is told about.
  const held = await BranchStock.findAll({
    where: { branchId, stock: { [Op.gt]: 0 } },
    include: [
      {
        model: Product,
        attributes: ['id', 'productName', 'sku', 'primaryUnit'],
        where: { detstatus: false },
      },
      { model: StockOwner, attributes: ['id', 'ownerName', 'ownerCode', 'isHouse'], required: false },
    ],
  });

  const binned = await BinStock.findAll({
    where: { branchId, detstatus: false },
    attributes: ['productId', 'ownerId', [fn('SUM', col('quantity')), 'total']],
    group: ['product_id', 'owner_id'],
    raw: true,
  });
  const binnedBy = new Map(binned.map((row) => [`${row.productId}:${row.ownerId}`, qty(row.total)]));

  return held
    .map((row) => {
      const onHand = qty(row.stock);
      const placed = binnedBy.get(`${row.productId}:${row.ownerId}`) || 0;
      return {
        // Product alone no longer identifies a row: the same product may be
        // waiting for two different owners.
        key: `${row.productId}:${row.ownerId}`,
        productId: row.productId,
        productName: row.Product?.productName,
        sku: row.Product?.sku,
        unit: row.Product?.primaryUnit,
        ownerId: row.ownerId,
        ownerName: row.StockOwner?.ownerName,
        isHouse: row.StockOwner?.isHouse !== false,
        onHand,
        binned: placed,
        toPutAway: qty(onHand - placed),
      };
    })
    .filter((row) => row.toPutAway > 0)
    .sort((a, b) => b.toPutAway - a.toPutAway);
}

/** Adds to a bin's quantity, creating the row on first use. */
async function adjustBin({ binId, branchId, productId, batchId = null, delta, transaction, userId, ownerId = null }) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const [row] = await BinStock.findOrCreate({
    where: { binId, productId, batchId: batchId ?? null, ownerId: owner },
    defaults: { binId, branchId, productId, batchId: batchId ?? null, ownerId: owner, quantity: 0, authadd: userId },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  const next = qty(Number(row.quantity) + Number(delta));
  if (next < 0) {
    throw Object.assign(
      new Error(`Bin does not hold enough (has ${row.quantity}, needs ${Math.abs(delta)})`),
      { status: 409 },
    );
  }

  await row.update({ quantity: next, authlstedit: userId ?? null }, { transaction });
  return next;
}

/**
 * Put-away: places stock that is already at the location into a bin.
 *
 * Refuses to place more than has actually arrived, which is the one way bin
 * quantities could otherwise exceed the location total and start lying about
 * what is in the building.
 */
export async function putAway({ branchId, binId, productId, batchId = null, quantity: amount, transaction, userId, ownerId = null }) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const placing = qty(amount);
  if (!(placing > 0)) {
    throw Object.assign(new Error('Put-away quantity must be greater than zero'), { status: 400 });
  }

  const bin = await WarehouseBin.findOne({
    where: { id: binId, branchId, detstatus: false, isActive: true },
    transaction,
  });
  if (!bin) throw Object.assign(new Error('Bin not found at this location'), { status: 404 });

  const available = await unassignedQty(productId, branchId, transaction, owner);
  if (placing > available) {
    throw Object.assign(
      new Error(`Only ${available} left to put away — the rest is already binned`),
      { status: 409 },
    );
  }

  // Capacity is advisory: a real warehouse overfills a bin rather than stopping
  // work, so this warns in the response instead of refusing the put-away.
  const after = await adjustBin({ binId, branchId, productId, batchId, delta: placing, transaction, userId, ownerId: owner });
  const overCapacity = bin.capacity !== null && after > Number(bin.capacity);

  return { binId, binCode: bin.code, quantity: after, overCapacity };
}

/** Moves stock from one bin to another within the same location. */
export async function moveBetweenBins({ branchId, fromBinId, toBinId, productId, batchId = null, quantity: amount, transaction, userId, ownerId = null }) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  if (Number(fromBinId) === Number(toBinId)) {
    throw Object.assign(new Error('Source and destination bins must differ'), { status: 400 });
  }
  const moving = qty(amount);
  if (!(moving > 0)) {
    throw Object.assign(new Error('Move quantity must be greater than zero'), { status: 400 });
  }

  await adjustBin({ binId: fromBinId, branchId, productId, batchId, delta: -moving, transaction, userId, ownerId: owner });
  await adjustBin({ binId: toBinId, branchId, productId, batchId, delta: moving, transaction, userId, ownerId: owner });
  return { moved: moving };
}

/**
 * Suggests where to pick a quantity from.
 *
 * Two orderings are at work here and they are kept strictly apart.
 *
 * **Which stock to take** is decided by expiry, oldest first, so the lot nearest
 * its date leaves the building first — in a seed or agri warehouse, picking
 * newest-first is how stock ends up written off on the shelf. That decision is
 * made in the allocation loop below and is not negotiable.
 *
 * **What order to visit the chosen bins in** is decided afterwards, by the
 * warehouse's own walking sequence. It changes nothing about what is picked,
 * only the order the picker collects it in.
 *
 * Folding the second into the first would let a shorter walk quietly outrank the
 * expiry rule, so the allocation runs to completion before the route is applied.
 */
export async function suggestPick({ branchId, productId, quantity: needed, transaction, ownerId = null }) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  const rows = await BinStock.findAll({
    // Only this owner's goods are pickable. A picker sent to a bin holding a
    // client's stock would take goods the order has no claim on.
    where: { branchId, productId, ownerId: owner, detstatus: false, quantity: { [Op.gt]: 0 } },
    include: [
      {
        model: WarehouseBin,
        // pickSequence comes back on the join that was already being made. The
        // alternative — reading the bin per suggested pick — is an N+1 on the
        // hottest query in the building.
        attributes: ['id', 'code', 'name', 'level', 'pickSequence'],
        where: { detstatus: false },
      },
      { model: ProductBatch, attributes: ['id', 'batchNumber', 'expiryDate'], required: false },
    ],
    transaction,
  });

  const sorted = rows.sort((a, b) => {
    const aExpiry = a.ProductBatch?.expiryDate || '9999-12-31';
    const bExpiry = b.ProductBatch?.expiryDate || '9999-12-31';
    if (aExpiry !== bExpiry) return aExpiry < bExpiry ? -1 : 1;
    return String(a.WarehouseBin?.code || '').localeCompare(String(b.WarehouseBin?.code || ''));
  });

  const picks = [];
  let outstanding = qty(needed);

  for (const row of sorted) {
    if (outstanding <= 0) break;
    const take = Math.min(qty(row.quantity), outstanding);
    picks.push({
      binStockId: row.id,
      binId: row.binId,
      binCode: row.WarehouseBin?.code,
      binName: row.WarehouseBin?.name,
      // The bin's fixed position in the building's walk. Null where the layout
      // has not been sequenced yet, which routing handles rather than rejects.
      pickSequence: row.WarehouseBin?.pickSequence ?? null,
      productId,
      batchId: row.batchId,
      batchNumber: row.ProductBatch?.batchNumber || null,
      expiryDate: row.ProductBatch?.expiryDate || null,
      available: qty(row.quantity),
      pick: take,
    });
    outstanding = qty(outstanding - take);
  }

  // The walk is applied only now, to picks the expiry rule has already chosen.
  // Quantities and lots are untouched; only the order changes.
  const routed = orderByRoute(picks);

  return {
    picks: routed,
    shortfall: outstanding,
    complete: outstanding <= 0,
  };
}

/**
 * Takes stock off the shelves. Reduces bin quantities only — the goods are on
 * the packing bench, still inside the building, so the location total is
 * untouched until they are actually dispatched.
 */
export async function pick({ branchId, productId, picks = [], transaction, userId, ownerId = null }) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  let picked = 0;
  for (const line of picks) {
    const amount = qty(line.pick ?? line.quantity);
    if (!(amount > 0)) continue;
    await adjustBin({
      binId: line.binId,
      branchId,
      productId,
      batchId: line.batchId ?? null,
      delta: -amount,
      transaction,
      userId,
      ownerId: owner,
    });
    picked = qty(picked + amount);
  }
  return { picked };
}

/**
 * Brings bins back within the location total after stock has left.
 *
 * The invariant is `sum(bin_stock) ≤ branch_stock`, and there are two ways
 * goods leave a location. One picks them off a shelf first — the bin is reduced
 * at pick time, and by the time the location total falls the two already agree.
 * The other does not: a transfer dispatch, a damage write-off, a return to a
 * supplier all reduce the location directly, and the bins are left insisting
 * they hold stock the building no longer has.
 *
 * That second case is the bug this exists to close. It cannot be fixed by
 * remembering to release bins in each of those callers, because the next
 * outbound path somebody writes will forget — so it is enforced centrally, at
 * the one place stock is allowed to move.
 *
 * Written as a clamp rather than a deduction, which makes it safe on every
 * path: it acts only when the bins genuinely exceed the total, so the
 * already-picked case is a no-op and nothing is ever taken off a shelf twice.
 *
 * Loose stock in the receiving bay absorbs the loss first — it is not in a bin,
 * so it needs no releasing, and it is what a store hand would reach for anyway
 * rather than breaking down a put-away pallet.
 */
export async function releaseExcessFromBins({
  branchId, productId, ownerId = null, transaction, userId = null,
}) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  if (!await usesBins(branchId, transaction)) return { released: 0 };

  const held = await BranchStock.findOne({
    where: { branchId, productId, ownerId: owner },
    transaction,
  });
  const onHand = qty(held?.stock || 0);
  const binned = await binnedQty(productId, branchId, transaction, owner);

  let excess = qty(binned - onHand);
  if (excess <= 0) return { released: 0 };

  // Oldest lot first, matching the pick rule — the goods leaving the building
  // should be the same ones a picker would have taken.
  const rows = await BinStock.findAll({
    where: { branchId, productId, ownerId: owner, detstatus: false, quantity: { [Op.gt]: 0 } },
    include: [
      { model: WarehouseBin, attributes: ['id', 'code'], where: { detstatus: false } },
      { model: ProductBatch, attributes: ['id', 'expiryDate'], required: false },
    ],
    transaction,
  });

  const sorted = rows.sort((a, b) => {
    const aExpiry = a.ProductBatch?.expiryDate || '9999-12-31';
    const bExpiry = b.ProductBatch?.expiryDate || '9999-12-31';
    if (aExpiry !== bExpiry) return aExpiry < bExpiry ? -1 : 1;
    return String(a.WarehouseBin?.code || '').localeCompare(String(b.WarehouseBin?.code || ''));
  });

  const from = [];
  for (const row of sorted) {
    if (excess <= 0) break;
    const take = Math.min(qty(row.quantity), excess);
    await row.update({
      quantity: qty(Number(row.quantity) - take),
      authlstedit: userId ?? null,
    }, { transaction });
    from.push({ binId: row.binId, binCode: row.WarehouseBin?.code, quantity: take });
    excess = qty(excess - take);
  }

  return { released: from.reduce((s, f) => s + f.quantity, 0), from };
}

/** Puts picked stock back on the shelves, when a pick is undone or cancelled. */
export async function returnToBins({ branchId, productId, picks = [], transaction, userId, ownerId = null }) {
  const owner = ownerId ?? await houseOwnerId(transaction);
  for (const line of picks) {
    const amount = qty(line.pick ?? line.quantity);
    if (!(amount > 0)) continue;
    await adjustBin({
      binId: line.binId,
      branchId,
      productId,
      batchId: line.batchId ?? null,
      delta: amount,
      transaction,
      userId,
      ownerId: owner,
    });
  }
}

/** What is in one bin. */
export async function binContents(binId) {
  return BinStock.findAll({
    where: { binId, detstatus: false, quantity: { [Op.gt]: 0 } },
    include: [
      { model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit'] },
      { model: ProductBatch, attributes: ['id', 'batchNumber', 'expiryDate'], required: false },
    ],
    order: [['id', 'ASC']],
  });
}

/** Which bins hold a product, for the "where is it" question. */
export async function locateProduct(productId, branchId = null) {
  const where = { productId, detstatus: false, quantity: { [Op.gt]: 0 } };
  if (branchId) where.branchId = branchId;

  return BinStock.findAll({
    where,
    include: [
      { model: WarehouseBin, attributes: ['id', 'code', 'name', 'level', 'branchId'] },
      { model: ProductBatch, attributes: ['id', 'batchNumber', 'expiryDate'], required: false },
    ],
    order: [['quantity', 'DESC']],
  });
}

/**
 * Where a product should be put away, best suggestion first.
 *
 * Three sources, in the order a storeman would actually think:
 *
 *   1. A put-away rule — cold goods to cold storage, fast movers near dispatch.
 *      Deliberate policy beats habit.
 *   2. Where this product already lives, so a line does not end up scattered
 *      across the building.
 *   3. The emptiest bin with room.
 *
 * Suggestions, never decisions: the screen still lets a picker choose. A rule
 * that sends stock to a full bin should not stop the goods being recorded.
 */
export async function suggestPutAway({ productId, branchId, transaction }) {
  const product = await Product.findByPk(productId, {
    attributes: ['id', 'categoryId', 'brandId', 'storageClass'],
    transaction,
  });
  if (!product) return [];

  const rules = await PutAwayRule.findAll({
    where: {
      isActive: true,
      detstatus: false,
      [Op.or]: [{ branchId: null }, { branchId }],
    },
    order: [['priority', 'ASC'], ['id', 'ASC']],
    transaction,
  });

  const matches = (rule) => {
    const value = String(rule.matchValue);
    if (rule.matchType === 'StorageClass') return String(product.storageClass) === value;
    if (rule.matchType === 'Category') return String(product.categoryId) === value;
    if (rule.matchType === 'Brand') return String(product.brandId) === value;
    if (rule.matchType === 'Product') return String(product.id) === value;
    return false;
  };

  const suggestions = [];
  const seen = new Set();

  const push = (bin, reason, extra = {}) => {
    if (!bin || seen.has(bin.id)) return;
    seen.add(bin.id);
    suggestions.push({
      binId: bin.id,
      binCode: bin.code,
      binName: bin.name,
      level: bin.level,
      reason,
      ...extra,
    });
  };

  // 1. Rules.
  for (const rule of rules) {
    if (!matches(rule)) continue;
    const bin = await WarehouseBin.findOne({
      where: { id: rule.targetBinId, branchId, detstatus: false, isActive: true },
      transaction,
    });
    push(bin, `Rule: ${rule.name}`);
  }

  // 2. Where it already is.
  const existing = await BinStock.findAll({
    where: { productId, branchId, detstatus: false, quantity: { [Op.gt]: 0 } },
    include: [{ model: WarehouseBin, where: { detstatus: false, isActive: true } }],
    order: [['quantity', 'DESC']],
    transaction,
  });
  for (const row of existing) {
    push(row.WarehouseBin, 'Already stored here', { holding: qty(row.quantity) });
  }

  // 3. Anywhere with room, emptiest first.
  const { bins } = await binOccupancy(branchId);
  const roomy = bins
    .filter((bin) => !bin.overCapacity && !seen.has(bin.binId))
    .sort((a, b) => (a.occupancy ?? 0) - (b.occupancy ?? 0))
    .slice(0, 5);
  for (const bin of roomy) {
    push({ id: bin.binId, code: bin.code, name: bin.name, level: bin.level }, 'Has room');
  }

  return suggestions;
}

/**
 * How full each bin is.
 *
 * Capacity is stated per bin and was, until now, only ever used to warn on a
 * single put-away — which meant a warehouse could fill up without anything
 * saying so. This is what turns that field into an answer to "where is there
 * room", the question a put-away actually starts from.
 *
 * Bins with no stated capacity report occupancy as null rather than zero: an
 * unmeasured bin is not an empty one, and showing it as 0% would send pickers
 * to the fullest shelf in the building.
 */
export async function binOccupancy(branchId) {
  const bins = await WarehouseBin.findAll({
    where: { branchId, detstatus: false, isActive: true },
    order: [['level', 'ASC'], ['code', 'ASC']],
  });

  const held = await BinStock.findAll({
    where: { branchId, detstatus: false },
    attributes: ['binId', [fn('SUM', col('quantity')), 'total'], [fn('COUNT', col('id')), 'lines']],
    group: ['bin_id'],
    raw: true,
  });
  const heldBy = new Map(held.map((row) => [Number(row.binId), row]));

  const rows = bins.map((bin) => {
    const stats = heldBy.get(bin.id);
    const quantity = qty(stats?.total || 0);
    const capacity = bin.capacity === null ? null : Number(bin.capacity);

    return {
      binId: bin.id,
      code: bin.code,
      name: bin.name,
      level: bin.level,
      parentId: bin.parentId,
      capacity,
      quantity,
      products: Number(stats?.lines || 0),
      occupancy: capacity && capacity > 0 ? Math.round((quantity / capacity) * 100) : null,
      overCapacity: capacity !== null && quantity > capacity,
      empty: quantity === 0,
    };
  });

  const measured = rows.filter((r) => r.occupancy !== null);
  return {
    bins: rows,
    total: rows.length,
    empty: rows.filter((r) => r.empty).length,
    overCapacity: rows.filter((r) => r.overCapacity).length,
    // Averaged only over bins that actually state a capacity, so a warehouse
    // that measures three shelves out of fifty is not reported as 6% full.
    averageOccupancy: measured.length
      ? Math.round(measured.reduce((sum, r) => sum + r.occupancy, 0) / measured.length)
      : null,
    unmeasured: rows.length - measured.length,
  };
}

/**
 * Bins that are over capacity, alongside those with room — the working list for
 * rebalancing a warehouse.
 */
export async function replenishmentSuggestions(branchId) {
  const { bins } = await binOccupancy(branchId);

  const overfull = bins.filter((b) => b.overCapacity);
  const roomy = bins
    .filter((b) => !b.overCapacity && b.capacity !== null && b.occupancy !== null && b.occupancy < 70)
    .sort((a, b) => a.occupancy - b.occupancy);

  return {
    overfull,
    // Emptiest first, so the obvious destination is at the top of the list.
    withRoom: roomy.slice(0, 20),
    hasWork: overfull.length > 0,
  };
}

/**
 * Reconciles binned quantities against location stock.
 *
 * Binned may legitimately be *less* than held — that is the receiving bay. More
 * than held is impossible and means something wrote a bin directly.
 */
export async function reconcileBins(branchId = null) {
  const where = { detstatus: false };
  if (branchId) where.branchId = branchId;

  const binned = await BinStock.findAll({
    where,
    attributes: ['productId', 'branchId', 'ownerId', [fn('SUM', col('quantity')), 'total']],
    group: ['product_id', 'branch_id', 'owner_id'],
    raw: true,
  });

  const rows = [];
  for (const row of binned) {
    // Owner is part of the comparison. Summing every owner's binned quantity
    // against one owner's location balance would report perfectly correct
    // stock as drift the moment a second owner stored the same product.
    const held = await BranchStock.findOne({
      where: { productId: row.productId, branchId: row.branchId, ownerId: row.ownerId },
    });
    const onHand = qty(held?.stock || 0);
    const placed = qty(row.total);
    if (placed <= onHand) continue;

    const product = await Product.findByPk(row.productId, { attributes: ['productName', 'sku'] });
    rows.push({
      productId: Number(row.productId),
      productName: product?.productName,
      sku: product?.sku,
      branchId: Number(row.branchId),
      ownerId: Number(row.ownerId),
      onHand,
      binned: placed,
      excess: qty(placed - onHand),
    });
  }

  return { rows, clean: rows.length === 0, checked: binned.length };
}
