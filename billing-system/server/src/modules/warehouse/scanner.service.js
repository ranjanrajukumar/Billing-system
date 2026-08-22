import { sequelize, Product, ProductVariant, ProductBatch, WarehouseBin, WarehouseTask, RfidTag } from '../../models/index.js';
import * as bins from './binStock.service.js';
import * as tasks from './warehouseTask.service.js';
import * as exceptions from './warehouseException.service.js';
import { touch } from './device.service.js';

/**
 * What a handheld talks to.
 *
 * The floor scans one thing at a time and the device has no idea what kind of
 * thing it just read — a bin label, a product barcode, a pack, a task sheet and
 * an RFID tag all arrive as a string. `resolve()` is therefore the busiest
 * endpoint in the warehouse: it answers "what is this?", and the device decides
 * what to offer next from the answer.
 *
 * Everything that writes goes through the services that already own those
 * rules — `binStock` for stock in bins, `warehouseTask` for work, and the
 * exception queue for disagreements. Nothing here moves stock by itself. A
 * second implementation of put-away that happened to live on the scanner path
 * is precisely how two code paths end up disagreeing about the same shelf.
 */

const clean = (code) => String(code ?? '').trim();

/**
 * Identify a scanned string.
 *
 * The order matters and is not arbitrary. Bins are checked first because a bin
 * code is the shortest, most collision-prone string in the building and a
 * picker standing at a rack is nearly always telling us where they are. Packs
 * come before loose products because a pack barcode that also matched a product
 * would otherwise sell the wrong balance — the same trap the till had.
 */
export async function resolve(code, { branchId = null } = {}) {
  const value = clean(code);
  if (!value) throw Object.assign(new Error('Nothing was scanned'), { status: 400 });

  // ---- a place ----
  const bin = await WarehouseBin.findOne({
    where: { code: value, detstatus: false, ...(branchId ? { branchId } : {}) },
  });
  if (bin) {
    return {
      kind: 'BIN',
      bin: { id: bin.id, code: bin.code, name: bin.name, level: bin.level, branchId: bin.branchId },
      contents: await bins.binContents(bin.id),
    };
  }

  // ---- a unit of work ----
  const task = await WarehouseTask.findOne({ where: { taskNumber: value, detstatus: false } });
  if (task) return { kind: 'TASK', task: await tasks.byId(task.id) };

  // ---- a sealed pack ----
  const variant = await ProductVariant.findOne({
    where: { barcode: value, detstatus: false, isActive: true },
  });
  if (variant) {
    const product = await Product.findByPk(variant.productId);
    return {
      kind: 'PACK',
      product: product ? { id: product.id, productName: product.productName, primaryUnit: product.primaryUnit } : null,
      variant: {
        id: variant.id, variantName: variant.variantName, sku: variant.sku,
        packSize: variant.packSize, packUnitCode: variant.packUnitCode, sellingPrice: variant.sellingPrice,
      },
      locations: product ? await bins.locateProduct(product.id, branchId) : [],
    };
  }

  // ---- loose stock ----
  const product = await Product.findOne({ where: { barcode: value, detstatus: false } });
  if (product) {
    return {
      kind: 'PRODUCT',
      product: {
        id: product.id, productName: product.productName,
        primaryUnit: product.primaryUnit, hsnCode: product.hsnCode,
      },
      locations: await bins.locateProduct(product.id, branchId),
    };
  }

  // ---- a batch/lot label ----
  const batch = await ProductBatch.findOne({ where: { batchNumber: value, detstatus: false } });
  if (batch) {
    const batchProduct = await Product.findByPk(batch.productId);
    return {
      kind: 'BATCH',
      batch: { id: batch.id, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate },
      product: batchProduct ? { id: batchProduct.id, productName: batchProduct.productName } : null,
    };
  }

  // ---- an RFID tag read by a handheld rather than a fixed reader ----
  const tag = await RfidTag.findOne({ where: { epc: value, detstatus: false } });
  if (tag) {
    const tagProduct = tag.productId ? await Product.findByPk(tag.productId) : null;
    return {
      kind: 'RFID_TAG',
      tag: {
        id: tag.id, epc: tag.epc, status: tag.status,
        quantity: tag.quantity, lastSeenBinId: tag.lastSeenBinId,
      },
      product: tagProduct ? { id: tagProduct.id, productName: tagProduct.productName } : null,
    };
  }

  // Deliberately a 404 with the code echoed back. A device that gets a generic
  // error cannot tell "unknown label" from "server broken", and the two need
  // very different reactions from the person holding it.
  throw Object.assign(
    new Error(`Nothing in the system matches "${value}"`),
    { status: 404, code: 'UNKNOWN_SCAN' },
  );
}

/** Put stock away into a bin, from a scan of the bin and the product. */
export async function putAway({ branchId, binId, productId, batchId = null, quantity, ownerId = null, userId = null }) {
  return sequelize.transaction((transaction) => bins.putAway({
    branchId, binId, productId, batchId, quantity, ownerId, transaction, userId,
  }));
}

/** Move stock from one bin to another, both scanned. */
export async function move({ branchId, fromBinId, toBinId, productId, batchId = null, quantity, ownerId = null, userId = null }) {
  return sequelize.transaction((transaction) => bins.moveBetweenBins({
    branchId, fromBinId, toBinId, productId, batchId, quantity, ownerId, transaction, userId,
  }));
}

/** Take stock out of named bins, which is what a pick confirmation is. */
export async function pick({ branchId, productId, picks = [], ownerId = null, userId = null }) {
  if (!Array.isArray(picks) || !picks.length) {
    throw Object.assign(new Error('A pick needs at least one bin and quantity'), { status: 400 });
  }
  return sequelize.transaction((transaction) => bins.pick({
    branchId, productId, picks, ownerId, transaction, userId,
  }));
}

/**
 * A counted quantity, straight off the shelf.
 *
 * This does not adjust stock, and that is the point. A count is one person's
 * observation; a correction is a decision with an audit trail behind it. What
 * a disagreement produces is an exception for somebody to settle, which is
 * exactly what the stock-count and adjustment screens already exist to do.
 */
export async function count({ branchId, binId, productId, batchId = null, countedQuantity, ownerId = null, userId = null }) {
  const counted = Number(countedQuantity);
  if (!Number.isFinite(counted) || counted < 0) {
    throw Object.assign(new Error('A counted quantity must be zero or more'), { status: 400 });
  }

  const contents = await bins.binContents(binId);
  const line = (contents || []).find((row) => Number(row.productId) === Number(productId));
  const expected = Number(line?.quantity || 0);

  if (Math.abs(expected - counted) < 0.0005) {
    return { agreed: true, expected, counted, exception: null };
  }

  const exception = await exceptions.raise({
    exceptionType: 'STOCK_MISMATCH',
    branchId,
    binId,
    productId,
    batchId,
    ownerId,
    expectedQuantity: expected,
    actualQuantity: counted,
    referenceType: 'SCAN_COUNT',
    description: `Counted ${counted} against a system figure of ${expected}`,
    userId,
  });

  return { agreed: false, expected, counted, exception };
}

/** Finish a task from the device that did the work. */
export async function completeTask(taskId, { completedQuantity = null, userId = null } = {}) {
  return tasks.complete(taskId, { completedQuantity, userId });
}

/** The operations a device is allowed to replay through `sync`. */
const SYNC_HANDLERS = {
  PUTAWAY: (op, ctx) => putAway({ ...op, ...ctx }),
  MOVE: (op, ctx) => move({ ...op, ...ctx }),
  PICK: (op, ctx) => pick({ ...op, ...ctx }),
  COUNT: (op, ctx) => count({ ...op, ...ctx }),
  TASK_COMPLETE: (op, ctx) => completeTask(op.taskId, { completedQuantity: op.completedQuantity, userId: ctx.userId }),
};

export const SYNC_OPERATIONS = Object.keys(SYNC_HANDLERS);

/**
 * Replay work a device did while it had no signal.
 *
 * Each operation succeeds or fails on its own and the batch never rolls back as
 * a whole. That is deliberate: a scanner coming back after an hour offline may
 * carry forty put-aways of which one is now impossible because somebody else
 * moved the pallet. Failing all forty would discard thirty-nine good pieces of
 * work and leave the floor re-keying them by hand — so each result is reported
 * separately and the device clears only what actually landed.
 *
 * `clientRef` is echoed back untouched so the device can match results to its
 * own queue. The per-request `Idempotency-Key` covers the batch itself, so a
 * sync retried after a dropped reply returns the first outcome rather than
 * doing the work twice.
 */
export async function sync({ operations = [], branchId, userId = null, deviceCode = null }) {
  if (!Array.isArray(operations) || !operations.length) {
    throw Object.assign(new Error('There is nothing to sync'), { status: 400 });
  }
  if (deviceCode) await touch(deviceCode);

  const results = [];
  for (const operation of operations) {
    const { clientRef = null, type, ...rest } = operation || {};
    const handler = SYNC_HANDLERS[type];

    if (!handler) {
      results.push({
        clientRef,
        type,
        ok: false,
        error: `Unknown operation "${type}" — expected one of: ${SYNC_OPERATIONS.join(', ')}`,
      });
      continue;
    }

    try {
      const result = await handler(rest, { branchId: rest.branchId || branchId, userId });
      results.push({ clientRef, type, ok: true, result });
    } catch (error) {
      // Captured rather than thrown, so one bad row cannot discard the rest.
      results.push({
        clientRef,
        type,
        ok: false,
        status: error.status || 500,
        error: error.message,
      });
    }
  }

  return {
    total: results.length,
    applied: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
