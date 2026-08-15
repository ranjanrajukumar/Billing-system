import { Op } from 'sequelize';
import { Product, StockOwner, User, WarehouseBin, WarehouseException } from '../models/index.js';
import {
  CLOSED_EXCEPTION_STATUSES, EXCEPTION_PRIORITIES, EXCEPTION_STATUSES, EXCEPTION_TYPES,
} from '../models/warehouseException.model.js';

/**
 * The exception queue.
 *
 * Raising an exception is deliberately cheap and never blocks: a picker who
 * finds nine where the list said ten reports it and carries on. Making them
 * stop and reconcile would mean, in practice, that they stop reporting.
 *
 * Resolving one is deliberately not cheap. It needs a person, an account of
 * what was done, and it is refused if the exception is already closed — the
 * record of who decided what, and when, is the whole value of the queue.
 */

/**
 * How urgent each kind is when nobody says.
 *
 * Not cosmetic: the queue is worked in priority order, so this decides what a
 * supervisor sees first on a bad morning. Anything where stock is *wrong* out-
 * ranks anything where stock is merely *short*, because a wrong figure spreads
 * — it gets sold, promised, and reordered against — while a short one is
 * already visible to the person standing in front of it.
 */
const DEFAULT_PRIORITY = {
  STOCK_MISMATCH: 'HIGH',
  WRONG_PRODUCT: 'HIGH',
  EXPIRED_BATCH: 'HIGH',
  DAMAGED_STOCK: 'NORMAL',
  WRONG_BIN: 'NORMAL',
  OVER_RECEIPT: 'NORMAL',
  SHORT_PICK: 'NORMAL',
  MISSING_SCAN: 'LOW',
};

/** Sort weight, so CRITICAL sorts before LOW rather than alphabetically. */
const PRIORITY_RANK = Object.fromEntries(
  ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].map((p, i) => [p, i]),
);

export function isOpen(exception) {
  return !CLOSED_EXCEPTION_STATUSES.includes(exception.status);
}

/**
 * Records that something was wrong.
 *
 * Takes a transaction so it can be raised inside the operation that discovered
 * it — a short pick and the exception describing it either both happen or
 * neither does, which stops the queue disagreeing with the stock it describes.
 */
export async function raise({
  exceptionType,
  branchId,
  referenceType = null,
  referenceId = null,
  binId = null,
  productId = null,
  batchId = null,
  ownerId = null,
  expectedQuantity = null,
  actualQuantity = null,
  priority = null,
  description = null,
  userId = null,
  transaction = undefined,
}) {
  if (!EXCEPTION_TYPES.includes(exceptionType)) {
    throw Object.assign(
      new Error(`Unknown exception type "${exceptionType}" — expected one of: ${EXCEPTION_TYPES.join(', ')}`),
      { status: 400 },
    );
  }
  if (!branchId) {
    throw Object.assign(new Error('An exception must say which location it happened at'), { status: 400 });
  }
  if (priority && !EXCEPTION_PRIORITIES.includes(priority)) {
    throw Object.assign(
      new Error(`Priority must be one of: ${EXCEPTION_PRIORITIES.join(', ')}`),
      { status: 400 },
    );
  }

  const created = await WarehouseException.create({
    exceptionType,
    branchId,
    referenceType,
    referenceId,
    binId,
    productId,
    batchId,
    ownerId,
    expectedQuantity,
    actualQuantity,
    priority: priority || DEFAULT_PRIORITY[exceptionType] || 'NORMAL',
    status: 'OPEN',
    description,
    reportedByUserId: userId,
    authadd: userId,
  }, { transaction });

  // Logged at the point of creation rather than left to a screen nobody has
  // open: an exception raised at 3am on a night shift needs to exist in the
  // log too, or the first anyone knows of it is the morning stock report.
  console.warn(
    `Warehouse exception ${created.id}: ${exceptionType} at location ${branchId}`
    + (productId ? ` for product ${productId}` : '')
    + (expectedQuantity !== null ? ` (expected ${expectedQuantity}, found ${actualQuantity})` : ''),
  );

  return created;
}

const INCLUDES = [
  { model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit'], required: false },
  { model: WarehouseBin, attributes: ['id', 'code', 'name', 'level'], required: false },
  { model: StockOwner, attributes: ['id', 'ownerName', 'isHouse'], required: false },
  { model: User, as: 'assignedTo', attributes: ['id', 'name'], required: false },
  { model: User, as: 'reportedBy', attributes: ['id', 'name'], required: false },
  { model: User, as: 'resolvedBy', attributes: ['id', 'name'], required: false },
];

/** The queue: open work first, worst first, oldest first within that. */
export async function queue({
  branchId = null, status = null, exceptionType = null, assignedUserId = null,
  openOnly = true, limit = 100, offset = 0,
} = {}) {
  const where = { detstatus: false };
  if (branchId) where.branchId = branchId;
  if (exceptionType) where.exceptionType = exceptionType;
  if (assignedUserId) where.assignedUserId = assignedUserId;

  if (status) where.status = status;
  else if (openOnly) where.status = { [Op.notIn]: CLOSED_EXCEPTION_STATUSES };

  const { rows, count } = await WarehouseException.findAndCountAll({
    where,
    include: INCLUDES,
    limit,
    offset,
    order: [['addondt', 'ASC']],
  });

  // Priority is an enum, and enum ordering differs by dialect — MySQL sorts by
  // declaration order, SQL Server alphabetically. Sorting in code keeps the
  // queue in the same order on every database.
  const sorted = rows.sort((a, b) => {
    const rank = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (rank !== 0) return rank;
    return new Date(a.addondt) - new Date(b.addondt);
  });

  return { rows: sorted, count };
}

export async function byId(id) {
  const found = await WarehouseException.findOne({
    where: { id, detstatus: false },
    include: INCLUDES,
  });
  if (!found) throw Object.assign(new Error('Exception not found'), { status: 404 });
  return found;
}

/** Gives it to somebody. Reassigning open work is allowed; closed work is not. */
export async function assign(id, { assignedUserId, userId = null }) {
  const exception = await byId(id);
  if (!isOpen(exception)) {
    throw Object.assign(
      new Error(`This exception is already ${exception.status} and cannot be reassigned`),
      { status: 409 },
    );
  }

  const person = await User.findOne({ where: { id: assignedUserId, detstatus: false } });
  if (!person) throw Object.assign(new Error('That user does not exist'), { status: 404 });

  await exception.update({
    assignedUserId,
    // Assigning does not start the work, so it goes to ASSIGNED rather than
    // IN_PROGRESS — the gap between the two is how long work sat in somebody's
    // queue before they got to it, which is worth being able to measure.
    status: exception.status === 'OPEN' ? 'ASSIGNED' : exception.status,
    authlstedit: userId,
  });
  return byId(id);
}

/** Marks somebody as actually working on it now. */
export async function start(id, { userId = null }) {
  const exception = await byId(id);
  if (!isOpen(exception)) {
    throw Object.assign(
      new Error(`This exception is already ${exception.status}`),
      { status: 409 },
    );
  }
  await exception.update({
    status: 'IN_PROGRESS',
    assignedUserId: exception.assignedUserId || userId,
    authlstedit: userId,
  });
  return byId(id);
}

/**
 * Closes an exception, either fixed or dismissed.
 *
 * A resolution note is required in both cases. "Rejected" with no reason is the
 * same as ignoring it, except that it also hides it from the queue — which is
 * strictly worse than leaving it open.
 */
export async function resolve(id, { resolution, reject = false, userId = null }) {
  const exception = await byId(id);

  if (!isOpen(exception)) {
    throw Object.assign(
      new Error(`This exception was already ${exception.status.toLowerCase()} on ${exception.resolvedAt}`),
      { status: 409 },
    );
  }
  if (!resolution || !String(resolution).trim()) {
    throw Object.assign(
      new Error('Say what was done about it — an exception closed with no account of how is indistinguishable from one ignored'),
      { status: 400 },
    );
  }

  await exception.update({
    status: reject ? 'REJECTED' : 'RESOLVED',
    resolution: String(resolution).trim(),
    resolvedByUserId: userId,
    resolvedAt: new Date(),
    authlstedit: userId,
  });

  console.log(
    `Warehouse exception ${id} ${reject ? 'rejected' : 'resolved'} by user ${userId}: ${resolution}`,
  );
  return byId(id);
}

/** Counts by type and priority — what the dashboard tile and the bell read. */
export async function summary(branchId = null) {
  const where = { detstatus: false, status: { [Op.notIn]: CLOSED_EXCEPTION_STATUSES } };
  if (branchId) where.branchId = branchId;

  const open = await WarehouseException.findAll({ where, attributes: ['exceptionType', 'priority', 'status'], raw: true });

  const countBy = (key) => open.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] || 0) + 1;
    return acc;
  }, {});

  return {
    open: open.length,
    byType: countBy('exceptionType'),
    byPriority: countBy('priority'),
    byStatus: countBy('status'),
    critical: open.filter((r) => r.priority === 'CRITICAL').length,
    unassigned: open.filter((r) => r.status === 'OPEN').length,
  };
}

export const VOCABULARY = {
  types: EXCEPTION_TYPES,
  statuses: EXCEPTION_STATUSES,
  priorities: EXCEPTION_PRIORITIES,
  defaultPriority: DEFAULT_PRIORITY,
};
