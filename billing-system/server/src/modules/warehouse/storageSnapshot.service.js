import { Op, fn, col } from 'sequelize';
import {
  BinStock, BranchStock, Branch, Product, StockOwner, WarehouseBin, WarehouseStorageSnapshot,
} from '../../models/index.js';

/**
 * Capturing what was in the building on a day, so it can be billed later.
 *
 * The rule this exists to enforce: **storage charges are never reconstructed
 * from current balances.** Goods that arrived on the 3rd and left on the 11th
 * leave no trace in a month-end balance, yet eight days of storage are owed on
 * them. Replaying the movement ledger to recover that is both expensive and
 * unstable — one backdated correction and last month's invoice no longer
 * reproduces.
 *
 * So each day is written down while it is still true, and never recalculated.
 * Monthly billing is then `SUM(charge)`, which gives the same answer every time
 * it is asked.
 */

/** Absent bin or batch are stored as 0, not NULL — see the model's index note. */
const NO_BIN = 0;
const NO_BATCH = 0;

/** Yesterday, in the local day the warehouse actually works to. */
export function previousDay(from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

const toDateOnly = (value) => (value instanceof Date
  ? value.toISOString().slice(0, 10)
  : String(value).slice(0, 10));

/**
 * Which zone a bin sits in, walking up the tree.
 *
 * Copied onto the snapshot rather than joined at billing time: warehouses get
 * reorganised, and a bin moved to another zone next year must not change what
 * an invoice said last year.
 */
async function zoneOf(binId, cache) {
  if (!binId) return null;
  if (cache.has(binId)) return cache.get(binId);

  let current = await WarehouseBin.findByPk(binId);
  let zone = null;
  let guard = 0;
  while (current && guard < 8) {
    if (current.level === 'Zone') { zone = current.id; break; }
    if (!current.parentId) break;
    current = await WarehouseBin.findByPk(current.parentId);
    guard += 1;
  }
  cache.set(binId, zone);
  return zone;
}

/**
 * Works out what one line costs for one day.
 *
 * Three reasons a charge legitimately comes out at zero, and each is recorded
 * so a client asking "why was this free" gets an answer rather than a shrug:
 * it is our own stock, the client is inside their free-days allowance, or no
 * rate has been agreed yet.
 */
function chargeFor({ owner, quantity, volume, daysHeld }) {
  if (!owner || owner.isHouse) {
    return { rate: 0, charge: 0, basis: 'HOUSE_STOCK' };
  }

  const rate = Number(owner.storageRatePerUnitPerDay || 0);
  if (!(rate > 0)) {
    return { rate: 0, charge: 0, basis: 'NO_RATE_AGREED' };
  }

  const freeDays = Number(owner.freeStorageDays || 0);
  if (freeDays > 0 && daysHeld !== null && daysHeld <= freeDays) {
    return { rate, charge: 0, basis: 'WITHIN_FREE_DAYS' };
  }

  // Volume is the better basis where a product declares it — a warehouse rents
  // space, not units — and unit count is the fallback where it does not.
  const billable = volume !== null && volume > 0 ? volume : Number(quantity || 0);
  const basis = volume !== null && volume > 0 ? 'VOLUME' : 'UNIT_COUNT';

  return {
    rate,
    charge: Math.round(billable * rate * 10_000) / 10_000,
    basis,
  };
}

/**
 * Captures one day.
 *
 * Idempotent by construction: the unique key on the snapshot grain means a
 * second run collides rather than double-charging. Collisions are counted and
 * reported instead of thrown, so a re-run to fill a gap is a normal, safe
 * operation rather than something needing a cleanup first.
 *
 * Bin-level rows are written where the warehouse uses bins, and one row per
 * location otherwise — a shop with no bins still gets a usable history.
 */
export async function captureDay(snapshotDate, { branchId = null, userId = null } = {}) {
  const date = toDateOnly(snapshotDate);
  const started = Date.now();

  const owners = new Map(
    (await StockOwner.findAll({ where: { detstatus: false } })).map((o) => [o.id, o]),
  );
  const products = new Map(
    (await Product.findAll({
      where: { detstatus: false },
      attributes: ['id', 'productName', 'unitVolume'],
    }).catch(() => [])).map((p) => [p.id, p]),
  );

  const zoneCache = new Map();
  let written = 0;
  let duplicates = 0;
  let charged = 0;

  const write = async (row) => {
    try {
      await WarehouseStorageSnapshot.create({ ...row, authadd: userId });
      written += 1;
      charged += Number(row.charge || 0);
    } catch (error) {
      // The grain's unique key doing its job. Not an error: it means this day
      // was already captured, which is exactly what should happen on a re-run.
      const duplicate = error?.name === 'SequelizeUniqueConstraintError'
        || /duplicate|unique/i.test(error?.original?.message || '');
      if (!duplicate) throw error;
      duplicates += 1;
    }
  };

  // ---- Bin-level, where the building has bins ----
  const binWhere = { detstatus: false, quantity: { [Op.gt]: 0 } };
  if (branchId) binWhere.branchId = branchId;

  const binRows = await BinStock.findAll({ where: binWhere });
  const binnedByLocation = new Set();

  for (const row of binRows) {
    binnedByLocation.add(`${row.branchId}:${row.productId}:${row.ownerId}`);
    const owner = owners.get(row.ownerId);
    const product = products.get(row.productId);
    const unitVolume = Number(product?.unitVolume || 0);
    const volume = unitVolume > 0 ? Math.round(unitVolume * Number(row.quantity) * 10_000) / 10_000 : null;

    const { rate, charge, basis } = chargeFor({
      owner, quantity: row.quantity, volume, daysHeld: null,
    });

    await write({
      snapshotDate: date,
      branchId: row.branchId,
      zoneId: await zoneOf(row.binId, zoneCache),
      binId: row.binId ?? NO_BIN,
      productId: row.productId,
      batchId: row.batchId ?? NO_BATCH,
      ownerId: row.ownerId,
      quantity: Number(row.quantity),
      occupiedVolume: volume,
      storageRate: rate,
      charge,
      chargeBasis: basis,
    });
  }

  // ---- Location-level, for whatever is not in a bin ----
  //
  // Stock in the receiving bay is still in the building and still taking space,
  // so it is charged. Only the portion not already counted at bin level is
  // written, or a warehouse with bins would bill everything twice.
  const locWhere = { detstatus: false, stock: { [Op.gt]: 0 } };
  if (branchId) locWhere.branchId = branchId;

  const locRows = await BranchStock.findAll({ where: locWhere });

  for (const row of locRows) {
    const binnedTotal = await BinStock.sum('quantity', {
      where: {
        branchId: row.branchId, productId: row.productId, ownerId: row.ownerId, detstatus: false,
      },
    });
    const loose = Number(row.stock) - Number(binnedTotal || 0);
    if (!(loose > 0)) continue;

    const owner = owners.get(row.ownerId);
    const product = products.get(row.productId);
    const unitVolume = Number(product?.unitVolume || 0);
    const volume = unitVolume > 0 ? Math.round(unitVolume * loose * 10_000) / 10_000 : null;

    const { rate, charge, basis } = chargeFor({
      owner, quantity: loose, volume, daysHeld: null,
    });

    await write({
      snapshotDate: date,
      branchId: row.branchId,
      zoneId: null,
      binId: NO_BIN,
      productId: row.productId,
      batchId: NO_BATCH,
      ownerId: row.ownerId,
      quantity: loose,
      occupiedVolume: volume,
      storageRate: rate,
      charge,
      chargeBasis: basis,
    });
  }

  const result = {
    snapshotDate: date,
    branchId,
    written,
    duplicates,
    totalCharge: Math.round(charged * 10_000) / 10_000,
    ms: Date.now() - started,
  };

  console.log(
    `Storage snapshot for ${date}: ${written} row(s) written, ${duplicates} already present, `
    + `charge ${result.totalCharge} (${result.ms}ms)`,
  );
  return result;
}

/**
 * Fills any days between the last snapshot and yesterday.
 *
 * A server that was switched off over a weekend must not simply lose those
 * days' storage revenue. Bounded so a long gap cannot turn a boot into an
 * hours-long backfill; anything older is reported and left for a deliberate
 * manual run.
 */
export async function catchUp({ maxDays = 14, userId = null } = {}) {
  const latest = await WarehouseStorageSnapshot.max('snapshotDate');
  const target = previousDay();

  const days = [];
  if (!latest) {
    days.push(target);
  } else {
    const cursor = new Date(toDateOnly(latest));
    cursor.setDate(cursor.getDate() + 1);
    while (toDateOnly(cursor) <= target && days.length < maxDays) {
      days.push(toDateOnly(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const results = [];
  for (const day of days) {
    results.push(await captureDay(day, { userId }));
  }

  const skipped = latest && days.length === maxDays;
  if (skipped) {
    console.warn(
      `Storage snapshot backfill stopped at ${maxDays} days. Older days are still missing — `
      + 'run the capture manually for the remaining range.',
    );
  }

  return { days: days.length, results, truncated: Boolean(skipped) };
}

/**
 * What a client owes for storage over a period.
 *
 * A plain sum of what was recorded. It deliberately does no arithmetic on
 * current stock — that is the whole reason the snapshots exist.
 */
export async function storageBill({ ownerId, from, to, branchId = null }) {
  const where = {
    detstatus: false,
    ownerId,
    snapshotDate: { [Op.gte]: toDateOnly(from), [Op.lte]: toDateOnly(to) },
  };
  if (branchId) where.branchId = branchId;

  const rows = await WarehouseStorageSnapshot.findAll({
    where,
    attributes: [
      'snapshotDate',
      [fn('SUM', col('charge')), 'charge'],
      [fn('SUM', col('quantity')), 'quantity'],
      [fn('COUNT', col('id')), 'lines'],
    ],
    group: ['snapshot_date'],
    raw: true,
  });

  const daily = rows
    .map((r) => ({
      date: toDateOnly(r.snapshotDate),
      charge: Number(r.charge || 0),
      quantity: Number(r.quantity || 0),
      lines: Number(r.lines || 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const owner = await StockOwner.findByPk(ownerId);

  return {
    owner: owner ? { id: owner.id, ownerName: owner.ownerName, isHouse: owner.isHouse } : null,
    from: toDateOnly(from),
    to: toDateOnly(to),
    branchId,
    daysBilled: daily.length,
    totalCharge: Math.round(daily.reduce((s, d) => s + d.charge, 0) * 100) / 100,
    // Surfaced rather than hidden: a gap means the job did not run that day, and
    // a bill quietly missing three days is worse than one that says so.
    daily,
  };
}

/** Days with no snapshot in a range — what a supervisor checks before invoicing. */
export async function missingDays({ from, to }) {
  const rows = await WarehouseStorageSnapshot.findAll({
    where: { snapshotDate: { [Op.gte]: toDateOnly(from), [Op.lte]: toDateOnly(to) } },
    attributes: [[fn('DISTINCT', col('snapshot_date')), 'snapshot_date']],
    raw: true,
  });
  const present = new Set(rows.map((r) => toDateOnly(r.snapshot_date)));

  const missing = [];
  const cursor = new Date(toDateOnly(from));
  const end = toDateOnly(to);
  while (toDateOnly(cursor) <= end) {
    const day = toDateOnly(cursor);
    if (!present.has(day)) missing.push(day);
    cursor.setDate(cursor.getDate() + 1);
  }
  return missing;
}
