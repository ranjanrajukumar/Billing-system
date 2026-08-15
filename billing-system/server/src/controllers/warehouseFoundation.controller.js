import { WarehouseBin, WarehouseStorageSnapshot } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import * as layout from '../services/binLayout.service.js';
import * as exceptions from '../services/warehouseException.service.js';
import * as tasks from '../services/warehouseTask.service.js';
import * as snapshots from '../services/storageSnapshot.service.js';
import { resolveOwnerId } from '../services/stockOwner.service.js';

/**
 * The API over the foundation tables.
 *
 * Everything returned goes through a DTO. Sequelize instances carry the audit
 * columns, the soft-delete flag and whatever associations happen to be loaded,
 * and shipping those straight out means the wire format changes whenever the
 * schema does — which is how a client breaks on a migration that touched
 * nothing it uses.
 */

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

const binDto = (bin) => (bin ? {
  id: bin.id,
  branchId: bin.branchId,
  parentId: bin.parentId,
  level: bin.level,
  code: bin.code,
  name: bin.name,
  pickSequence: bin.pickSequence,
  position: (bin.positionX !== null || bin.positionY !== null || bin.positionZ !== null)
    ? { x: num(bin.positionX), y: num(bin.positionY), z: num(bin.positionZ) }
    : null,
  capacity: {
    units: num(bin.capacity),
    volume: num(bin.capacityVolume),
    maxWeightKg: num(bin.maxWeightKg),
  },
  isActive: bin.isActive,
  createdAt: bin.addondt,
  updatedAt: bin.editondt,
} : null);

const exceptionDto = (row) => (row ? {
  id: row.id,
  exceptionType: row.exceptionType,
  status: row.status,
  priority: row.priority,
  reference: row.referenceType ? { type: row.referenceType, id: row.referenceId } : null,
  branchId: row.branchId,
  bin: row.WarehouseBin ? { id: row.WarehouseBin.id, code: row.WarehouseBin.code, name: row.WarehouseBin.name } : null,
  product: row.Product
    ? { id: row.Product.id, name: row.Product.productName, sku: row.Product.sku, unit: row.Product.primaryUnit }
    : null,
  owner: row.StockOwner ? { id: row.StockOwner.id, name: row.StockOwner.ownerName, isHouse: row.StockOwner.isHouse } : null,
  expectedQuantity: num(row.expectedQuantity),
  actualQuantity: num(row.actualQuantity),
  // The number somebody actually acts on, computed once here rather than in
  // every screen that shows an exception.
  variance: row.expectedQuantity !== null && row.actualQuantity !== null
    ? Number(row.actualQuantity) - Number(row.expectedQuantity)
    : null,
  description: row.description,
  resolution: row.resolution,
  assignedTo: row.assignedTo ? { id: row.assignedTo.id, name: row.assignedTo.name } : null,
  reportedBy: row.reportedBy ? { id: row.reportedBy.id, name: row.reportedBy.name } : null,
  resolvedBy: row.resolvedBy ? { id: row.resolvedBy.id, name: row.resolvedBy.name } : null,
  createdAt: row.addondt,
  resolvedAt: row.resolvedAt,
} : null);

const taskDto = (row) => (row ? {
  id: row.id,
  taskNumber: row.taskNumber,
  taskType: row.taskType,
  status: row.status,
  priority: row.priority,
  branchId: row.branchId,
  sourceBin: row.sourceBin
    ? { id: row.sourceBin.id, code: row.sourceBin.code, pickSequence: row.sourceBin.pickSequence }
    : null,
  destinationBin: row.destinationBin
    ? { id: row.destinationBin.id, code: row.destinationBin.code, pickSequence: row.destinationBin.pickSequence }
    : null,
  product: row.Product
    ? {
      id: row.Product.id, name: row.Product.productName, sku: row.Product.sku,
      unit: row.Product.primaryUnit, barcode: row.Product.barcode,
    }
    : null,
  batch: row.ProductBatch
    ? { id: row.ProductBatch.id, batchNumber: row.ProductBatch.batchNumber, expiryDate: row.ProductBatch.expiryDate }
    : null,
  owner: row.StockOwner ? { id: row.StockOwner.id, name: row.StockOwner.ownerName, isHouse: row.StockOwner.isHouse } : null,
  quantity: num(row.quantity),
  completedQuantity: num(row.completedQuantity),
  pickSequence: row.pickSequence,
  assignedTo: row.assignedTo ? { id: row.assignedTo.id, name: row.assignedTo.name } : null,
  reference: row.referenceType ? { type: row.referenceType, id: row.referenceId } : null,
  instructions: row.instructions,
  failureReason: row.failureReason,
  createdAt: row.addondt,
  assignedAt: row.assignedAt,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  // Precomputed for productivity screens, which would otherwise all do this
  // subtraction slightly differently.
  durationSeconds: row.startedAt && row.completedAt
    ? Math.max(0, Math.round((new Date(row.completedAt) - new Date(row.startedAt)) / 1000))
    : null,
} : null);

const snapshotDto = (row) => ({
  id: row.id,
  snapshotDate: row.snapshotDate,
  branchId: row.branchId,
  zoneId: row.zoneId,
  binId: row.binId || null,
  productId: row.productId,
  batchId: row.batchId || null,
  ownerId: row.ownerId,
  quantity: num(row.quantity),
  occupiedVolume: num(row.occupiedVolume),
  storageRate: num(row.storageRate),
  charge: num(row.charge),
  chargeBasis: row.chargeBasis,
});

/** DECIMAL comes back from some dialects as a string; the wire wants numbers. */
function num(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const branchOf = (req) => Number(req.query.branchId || req.body?.branchId || req.branchId);

// ---------------------------------------------------------------------------
// 1. Bin coordinates and pick sequence
// ---------------------------------------------------------------------------

/** Every storage bin at a location, in the order a picker walks them. */
export const walkOrder = asyncHandler(async (req, res) => {
  const branchId = branchOf(req);
  const bins = await layout.walkOrder(branchId, {
    includeInactive: req.query.includeInactive === 'true',
  });

  res.json({
    branchId,
    bins: bins.map((bin) => ({ ...binDto(bin), path: null })),
    health: await layout.routeHealth(branchId),
  });
});

/** Gaps, duplicates and unsequenced bins — checked before printing routes. */
export const routeHealth = asyncHandler(async (req, res) => {
  res.json(await layout.routeHealth(branchOf(req)));
});

/**
 * Generates a walking route.
 *
 * `dryRun` returns the proposed route without writing it, so a supervisor can
 * look at the order before every printed pick list in the building changes.
 */
export const generateRoute = asyncHandler(async (req, res) => {
  const branchId = branchOf(req);
  const start = Number(req.body.start ?? 100);
  const step = Number(req.body.step ?? 10);

  if (!Number.isInteger(start) || start < 0) {
    return res.status(400).json({ message: 'Route start must be a whole number of zero or more' });
  }
  if (!Number.isInteger(step) || step < 1) {
    return res.status(400).json({ message: 'Route step must be a whole number of at least 1' });
  }

  const result = await layout.generateWalkRoute(branchId, {
    serpentine: req.body.serpentine !== false,
    start,
    step,
    dryRun: req.body.dryRun === true,
    userId: req.user.id,
  });

  res.json(result);
});

/** Sequences set by hand, which beat any generated route in a known building. */
export const setSequences = asyncHandler(async (req, res) => {
  const entries = Array.isArray(req.body.bins) ? req.body.bins : [];
  if (!entries.length) {
    return res.status(400).json({ message: 'Send a list of bins with their pick sequences' });
  }
  res.json(await layout.applySequences(branchOf(req), entries, req.user.id));
});

/** The full address of one bin: "ZONE-A › AISLE-01 › RACK-01 › BIN-003". */
export const binPath = asyncHandler(async (req, res) => {
  const trail = await layout.pathTo(req.params.binId);
  if (!trail.length) return res.status(404).json({ message: 'Bin not found' });

  res.json({
    binId: Number(req.params.binId),
    path: trail.map((b) => b.code).join(' › '),
    trail: trail.map(binDto),
  });
});

/** Updates the physical position and capacity of a bin. */
export const updateBinLayout = asyncHandler(async (req, res) => {
  const bin = await WarehouseBin.findOne({ where: { id: req.params.binId, detstatus: false } });
  if (!bin) return res.status(404).json({ message: 'Bin not found' });

  const fields = {};
  for (const key of ['positionX', 'positionY', 'positionZ', 'capacity', 'capacityVolume', 'maxWeightKg']) {
    if (req.body[key] !== undefined) {
      const value = req.body[key] === null || req.body[key] === '' ? null : Number(req.body[key]);
      if (value !== null && !Number.isFinite(value)) {
        return res.status(400).json({ message: `${key} must be a number` });
      }
      fields[key] = value;
    }
  }
  if (req.body.pickSequence !== undefined) {
    const seq = req.body.pickSequence === null ? null : Number(req.body.pickSequence);
    if (seq !== null && !Number.isInteger(seq)) {
      return res.status(400).json({ message: 'Pick sequence must be a whole number' });
    }
    fields.pickSequence = seq;
  }
  if (req.body.isActive !== undefined) fields.isActive = Boolean(req.body.isActive);

  await bin.update({ ...fields, authlstedit: req.user.id });
  res.json(binDto(await WarehouseBin.findByPk(bin.id)));
});

// ---------------------------------------------------------------------------
// 3. Exception queue
// ---------------------------------------------------------------------------

export const exceptionVocabulary = asyncHandler(async (_req, res) => {
  res.json(exceptions.VOCABULARY);
});

export const listExceptions = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await exceptions.queue({
    branchId: req.query.branchId ? Number(req.query.branchId) : null,
    status: req.query.status || null,
    exceptionType: req.query.exceptionType || null,
    assignedUserId: req.query.assignedUserId ? Number(req.query.assignedUserId) : null,
    openOnly: req.query.all !== 'true',
    limit,
    offset,
  });
  res.json(paged(rows.map(exceptionDto), count, page, limit));
});

export const getException = asyncHandler(async (req, res) => {
  res.json(exceptionDto(await exceptions.byId(req.params.id)));
});

export const exceptionSummary = asyncHandler(async (req, res) => {
  res.json(await exceptions.summary(req.query.branchId ? Number(req.query.branchId) : null));
});

export const createException = asyncHandler(async (req, res) => {
  const created = await exceptions.raise({
    exceptionType: req.body.exceptionType,
    branchId: branchOf(req),
    referenceType: req.body.referenceType || null,
    referenceId: req.body.referenceId ? Number(req.body.referenceId) : null,
    binId: req.body.binId ? Number(req.body.binId) : null,
    productId: req.body.productId ? Number(req.body.productId) : null,
    batchId: req.body.batchId ? Number(req.body.batchId) : null,
    ownerId: req.body.ownerId ? await resolveOwnerId(req.body.ownerId) : null,
    expectedQuantity: req.body.expectedQuantity ?? null,
    actualQuantity: req.body.actualQuantity ?? null,
    priority: req.body.priority || null,
    description: req.body.description || null,
    userId: req.user.id,
  });
  res.status(201).json(exceptionDto(await exceptions.byId(created.id)));
});

export const assignException = asyncHandler(async (req, res) => {
  if (!req.body.assignedUserId) {
    return res.status(400).json({ message: 'Say who it is being assigned to' });
  }
  res.json(exceptionDto(await exceptions.assign(req.params.id, {
    assignedUserId: Number(req.body.assignedUserId), userId: req.user.id,
  })));
});

export const startException = asyncHandler(async (req, res) => {
  res.json(exceptionDto(await exceptions.start(req.params.id, { userId: req.user.id })));
});

export const resolveException = asyncHandler(async (req, res) => {
  res.json(exceptionDto(await exceptions.resolve(req.params.id, {
    resolution: req.body.resolution,
    reject: req.body.reject === true,
    userId: req.user.id,
  })));
});

// ---------------------------------------------------------------------------
// 4. Warehouse tasks
// ---------------------------------------------------------------------------

export const taskVocabulary = asyncHandler(async (_req, res) => {
  res.json(tasks.VOCABULARY);
});

export const listTasks = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await tasks.board({
    branchId: req.query.branchId ? Number(req.query.branchId) : null,
    status: req.query.status || null,
    taskType: req.query.taskType || null,
    assignedUserId: req.query.assignedUserId ? Number(req.query.assignedUserId) : null,
    openOnly: req.query.all !== 'true',
    limit,
    offset,
  });
  res.json(paged(rows.map(taskDto), count, page, limit));
});

/** The signed-in person's own list, in walking order. */
export const myTasks = asyncHandler(async (req, res) => {
  const rows = await tasks.myTasks({
    assignedUserId: req.user.id,
    branchId: req.query.branchId ? Number(req.query.branchId) : null,
  });
  res.json({ tasks: rows.map(taskDto) });
});

export const getTask = asyncHandler(async (req, res) => {
  res.json(taskDto(await tasks.byId(req.params.id)));
});

export const taskSummary = asyncHandler(async (req, res) => {
  res.json(await tasks.summary(req.query.branchId ? Number(req.query.branchId) : null));
});

export const createTask = asyncHandler(async (req, res) => {
  const created = await tasks.create({
    taskType: req.body.taskType,
    branchId: branchOf(req),
    sourceBinId: req.body.sourceBinId ? Number(req.body.sourceBinId) : null,
    destinationBinId: req.body.destinationBinId ? Number(req.body.destinationBinId) : null,
    productId: req.body.productId ? Number(req.body.productId) : null,
    batchId: req.body.batchId ? Number(req.body.batchId) : null,
    ownerId: req.body.ownerId ? await resolveOwnerId(req.body.ownerId) : null,
    quantity: req.body.quantity ?? null,
    priority: req.body.priority || 'NORMAL',
    assignedUserId: req.body.assignedUserId ? Number(req.body.assignedUserId) : null,
    referenceType: req.body.referenceType || null,
    referenceId: req.body.referenceId ? Number(req.body.referenceId) : null,
    instructions: req.body.instructions || null,
    userId: req.user.id,
  });
  res.status(201).json(taskDto(await tasks.byId(created.id)));
});

export const assignTask = asyncHandler(async (req, res) => {
  if (!req.body.assignedUserId) {
    return res.status(400).json({ message: 'Say who the task is being assigned to' });
  }
  res.json(taskDto(await tasks.assign(req.params.id, {
    assignedUserId: Number(req.body.assignedUserId), userId: req.user.id,
  })));
});

export const startTask = asyncHandler(async (req, res) => {
  res.json(taskDto(await tasks.start(req.params.id, { userId: req.user.id })));
});

/**
 * Finishes a task.
 *
 * `alreadyCompleted` is returned rather than hidden. A scanner that retried
 * after a timeout gets a success either way — but a caller that moves stock
 * needs to know which of the two it is looking at.
 */
export const completeTask = asyncHandler(async (req, res) => {
  const { task, alreadyCompleted } = await tasks.complete(req.params.id, {
    completedQuantity: req.body.completedQuantity ?? null,
    userId: req.user.id,
  });
  res.json({ task: taskDto(task), alreadyCompleted });
});

export const cancelTask = asyncHandler(async (req, res) => {
  res.json(taskDto(await tasks.cancel(req.params.id, {
    reason: req.body.reason || null, userId: req.user.id,
  })));
});

export const failTask = asyncHandler(async (req, res) => {
  res.json(taskDto(await tasks.markFailed(req.params.id, {
    reason: req.body.reason, userId: req.user.id,
  })));
});

export const taskProductivity = asyncHandler(async (req, res) => {
  res.json({
    from: req.query.from || null,
    to: req.query.to || null,
    people: await tasks.productivity({
      branchId: req.query.branchId ? Number(req.query.branchId) : null,
      from: req.query.from || null,
      to: req.query.to || null,
    }),
  });
});

// ---------------------------------------------------------------------------
// 5. Storage snapshots
// ---------------------------------------------------------------------------

export const listSnapshots = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.date) where.snapshotDate = req.query.date;
  if (req.query.branchId) where.branchId = Number(req.query.branchId);
  if (req.query.ownerId) where.ownerId = Number(req.query.ownerId);

  const { rows, count } = await WarehouseStorageSnapshot.findAndCountAll({
    where, limit, offset, order: [['snapshotDate', 'DESC'], ['id', 'ASC']],
  });
  res.json(paged(rows.map(snapshotDto), count, page, limit));
});

/**
 * Captures a day by hand.
 *
 * Exists because the scheduled job can miss days — a server switched off over a
 * weekend — and the missed revenue is not recoverable any other way. Safe to
 * call repeatedly: duplicates are counted, not charged twice.
 */
export const captureSnapshot = asyncHandler(async (req, res) => {
  const date = req.body.date || snapshots.previousDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: 'Date must be YYYY-MM-DD' });
  }
  if (date > new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ message: 'A day that has not happened yet cannot be captured' });
  }

  res.json(await snapshots.captureDay(date, {
    branchId: req.body.branchId ? Number(req.body.branchId) : null,
    userId: req.user.id,
  }));
});

/** Days with no snapshot — checked before invoicing a period. */
export const snapshotGaps = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ message: 'Give a from and to date' });
  res.json({ from, to, missing: await snapshots.missingDays({ from, to }) });
});

/** A client's storage charge for a period, summed from the daily record. */
export const storageBill = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ message: 'Give a from and to date' });

  const bill = await snapshots.storageBill({
    ownerId: await resolveOwnerId(req.params.ownerId),
    from,
    to,
    branchId: req.query.branchId ? Number(req.query.branchId) : null,
  });

  // Surfaced with the bill rather than left to be discovered: an invoice built
  // over a period with missing days is quietly short, and the only moment
  // anybody would notice is when the client queries it.
  const missing = await snapshots.missingDays({ from, to });
  res.json({
    ...bill,
    missingDays: missing,
    complete: missing.length === 0,
  });
});
