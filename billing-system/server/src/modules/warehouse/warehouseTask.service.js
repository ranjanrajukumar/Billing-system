import { Op } from 'sequelize';
import {
  Product, ProductBatch, sequelize, StockOwner, User, WarehouseBin, WarehouseTask,
} from '../../models/index.js';
import {
  CLOSED_TASK_STATUSES, TASK_PRIORITIES, TASK_STATUSES, TASK_TRANSITIONS, TASK_TYPES,
} from '../../models/warehouseTask.model.js';

/**
 * Warehouse work as records rather than instructions.
 *
 * Two things here are load-bearing and worth stating plainly.
 *
 * **Completion happens once.** Two handhelds can end up holding the same task —
 * a supervisor reassigns while a picker is walking, or a device retries after a
 * timeout. If both complete it and each moves stock, the stock moves twice. So
 * completion is a conditional update guarded on `completedAt IS NULL`: the
 * database decides which one wins, and the loser is told the work was already
 * done rather than silently doing it again.
 *
 * **Tasks do not move stock.** A task says what should happen; the stock engine
 * makes it happen. Keeping them apart means a task can be cancelled, reassigned
 * or abandoned without anything having to be unwound, and it is why the double-
 * completion guard is enough — the caller does the movement only when the guard
 * has already told it that it won.
 */

const PRIORITY_RANK = Object.fromEntries(
  ['URGENT', 'HIGH', 'NORMAL', 'LOW'].map((p, i) => [p, i]),
);

const INCLUDES = [
  { model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'barcode'], required: false },
  { model: ProductBatch, attributes: ['id', 'batchNumber', 'expiryDate'], required: false },
  { model: WarehouseBin, as: 'sourceBin', attributes: ['id', 'code', 'name', 'pickSequence'], required: false },
  { model: WarehouseBin, as: 'destinationBin', attributes: ['id', 'code', 'name', 'pickSequence'], required: false },
  { model: StockOwner, attributes: ['id', 'ownerName', 'isHouse'], required: false },
  { model: User, as: 'assignedTo', attributes: ['id', 'name'], required: false },
];

async function nextTaskNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await WarehouseTask.count({
    where: { taskNumber: { [Op.like]: `TSK-${year}-%` } },
    transaction,
  });
  return `TSK-${year}-${String(count + 1).padStart(6, '0')}`;
}

/**
 * Creates a piece of work.
 *
 * The source bin's walk position is copied onto the task. Denormalised on
 * purpose — a picker's list is re-sorted by it on every refresh, and joining the
 * bin tree to sort the most frequently hit query in the building is a cost that
 * shows up as lag on the handheld.
 */
export async function create({
  taskType,
  branchId,
  sourceBinId = null,
  destinationBinId = null,
  productId = null,
  batchId = null,
  ownerId = null,
  quantity = null,
  priority = 'NORMAL',
  assignedUserId = null,
  referenceType = null,
  referenceId = null,
  instructions = null,
  userId = null,
  transaction = undefined,
}) {
  if (!TASK_TYPES.includes(taskType)) {
    throw Object.assign(
      new Error(`Unknown task type "${taskType}" — expected one of: ${TASK_TYPES.join(', ')}`),
      { status: 400 },
    );
  }
  if (!branchId) {
    throw Object.assign(new Error('A task must say which location it is at'), { status: 400 });
  }
  if (!TASK_PRIORITIES.includes(priority)) {
    throw Object.assign(
      new Error(`Priority must be one of: ${TASK_PRIORITIES.join(', ')}`),
      { status: 400 },
    );
  }
  if (quantity !== null && !(Number(quantity) > 0)) {
    throw Object.assign(new Error('Task quantity must be greater than zero'), { status: 400 });
  }

  let pickSequence = null;
  if (sourceBinId) {
    const bin = await WarehouseBin.findOne({
      where: { id: sourceBinId, branchId, detstatus: false },
      transaction,
    });
    if (!bin) {
      throw Object.assign(new Error('Source bin not found at this location'), { status: 404 });
    }
    pickSequence = bin.pickSequence;
  }
  if (destinationBinId) {
    const bin = await WarehouseBin.findOne({
      where: { id: destinationBinId, branchId, detstatus: false },
      transaction,
    });
    if (!bin) {
      throw Object.assign(new Error('Destination bin not found at this location'), { status: 404 });
    }
  }

  const task = await WarehouseTask.create({
    taskNumber: await nextTaskNumber(transaction),
    taskType,
    branchId,
    sourceBinId,
    destinationBinId,
    productId,
    batchId,
    ownerId,
    quantity,
    priority,
    assignedUserId,
    // Handing a task straight to somebody skips the unassigned pool, which is
    // what a system-generated replenishment does when it knows who is on shift.
    status: assignedUserId ? 'ASSIGNED' : 'CREATED',
    assignedAt: assignedUserId ? new Date() : null,
    referenceType,
    referenceId,
    pickSequence,
    instructions,
    authadd: userId,
  }, { transaction });

  return task;
}

/** Creates many at once — a pick list becomes one task per line. */
export async function createMany(specs = [], { transaction, userId = null } = {}) {
  const created = [];
  for (const spec of specs) {
    created.push(await create({ ...spec, userId, transaction }));
  }
  return created;
}

export async function byId(id) {
  const task = await WarehouseTask.findOne({
    where: { id, detstatus: false },
    include: INCLUDES,
  });
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  return task;
}

/** Refuses a move the lifecycle does not allow. */
function assertTransition(from, to) {
  const allowed = TASK_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw Object.assign(
      new Error(
        allowed.length
          ? `A ${from} task cannot become ${to} — it can only go to: ${allowed.join(', ')}`
          : `A ${from} task is finished and cannot change`,
      ),
      { status: 409 },
    );
  }
}

export async function assign(id, { assignedUserId, userId = null }) {
  const task = await byId(id);
  assertTransition(task.status, 'ASSIGNED');

  const person = await User.findOne({ where: { id: assignedUserId, detstatus: false } });
  if (!person) throw Object.assign(new Error('That user does not exist'), { status: 404 });

  await task.update({
    assignedUserId, status: 'ASSIGNED', assignedAt: new Date(), authlstedit: userId,
  });
  return byId(id);
}

/**
 * Picks the task up.
 *
 * Guarded the same way completion is: a conditional update on the status, so
 * two devices starting the same task resolve to one. Without it, both would
 * believe they own the work and both would walk to the bin.
 */
export async function start(id, { userId = null }) {
  const task = await byId(id);
  assertTransition(task.status, 'IN_PROGRESS');

  const [changed] = await WarehouseTask.update(
    {
      status: 'IN_PROGRESS',
      startedAt: task.startedAt || new Date(),
      assignedUserId: task.assignedUserId || userId,
      authlstedit: userId,
    },
    { where: { id, status: task.status, detstatus: false } },
  );

  if (!changed) {
    throw Object.assign(
      new Error('Somebody else started this task first — refresh your list'),
      { status: 409, code: 'TASK_ALREADY_STARTED' },
    );
  }
  return byId(id);
}

/**
 * Finishes the task, exactly once.
 *
 * The `completedAt IS NULL` condition is the guard. It is checked by the
 * database as part of the write, so there is no window between deciding the
 * task is open and marking it closed — which is precisely the window two
 * scanners would otherwise both fit through.
 *
 * Returns `{ task, alreadyCompleted }`. A caller that moves stock must act only
 * when `alreadyCompleted` is false; that is the whole contract.
 */
export async function complete(id, {
  completedQuantity = null, userId = null, transaction = undefined,
} = {}) {
  const existing = await WarehouseTask.findOne({
    where: { id, detstatus: false },
    transaction,
  });
  if (!existing) throw Object.assign(new Error('Task not found'), { status: 404 });

  if (existing.status === 'COMPLETED' || existing.completedAt) {
    return { task: await byId(id), alreadyCompleted: true };
  }
  if (CLOSED_TASK_STATUSES.includes(existing.status)) {
    throw Object.assign(
      new Error(`This task was ${existing.status.toLowerCase()} and cannot be completed`),
      { status: 409 },
    );
  }

  const done = completedQuantity === null ? existing.quantity : Number(completedQuantity);
  if (done !== null && Number(done) < 0) {
    throw Object.assign(new Error('Completed quantity cannot be negative'), { status: 400 });
  }

  const [changed] = await WarehouseTask.update(
    {
      status: 'COMPLETED',
      completedQuantity: done,
      completedAt: new Date(),
      startedAt: existing.startedAt || new Date(),
      assignedUserId: existing.assignedUserId || userId,
      authlstedit: userId,
    },
    {
      // The guard. Only one caller can find this row still open.
      where: { id, completedAt: null, detstatus: false },
      transaction,
    },
  );

  if (!changed) {
    // Lost the race. Not an error — the work is done, which is what the caller
    // wanted; it simply must not do the stock movement a second time.
    return { task: await byId(id), alreadyCompleted: true };
  }

  console.log(`Warehouse task ${existing.taskNumber || id} (${existing.taskType}) completed by user ${userId}`);
  return { task: await byId(id), alreadyCompleted: false };
}

export async function cancel(id, { reason = null, userId = null } = {}) {
  const task = await byId(id);
  assertTransition(task.status, 'CANCELLED');
  await task.update({
    status: 'CANCELLED', failureReason: reason, completedAt: new Date(), authlstedit: userId,
  });
  return byId(id);
}

/** Records that it could not be done, leaving it retryable. */
export async function markFailed(id, { reason, userId = null }) {
  const task = await byId(id);
  assertTransition(task.status, 'FAILED');
  if (!reason || !String(reason).trim()) {
    throw Object.assign(new Error('Say why the task failed'), { status: 400 });
  }
  await task.update({
    status: 'FAILED', failureReason: String(reason).trim(), authlstedit: userId,
  });
  console.warn(`Warehouse task ${task.taskNumber || id} failed: ${reason}`);
  return byId(id);
}

/**
 * A person's work list, in the order they should walk it.
 *
 * Sorted by priority first and walk position second, so an urgent task is not
 * buried at the far end of the building — but within one priority the route is
 * respected, which is the whole point of holding a pick sequence.
 */
export async function myTasks({ assignedUserId, branchId = null, limit = 100 }) {
  const where = {
    detstatus: false,
    assignedUserId,
    status: { [Op.in]: ['ASSIGNED', 'IN_PROGRESS'] },
  };
  if (branchId) where.branchId = branchId;

  const rows = await WarehouseTask.findAll({ where, include: INCLUDES, limit });

  return rows.sort((a, b) => {
    const rank = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (rank !== 0) return rank;
    const aSeq = a.pickSequence ?? Number.MAX_SAFE_INTEGER;
    const bSeq = b.pickSequence ?? Number.MAX_SAFE_INTEGER;
    if (aSeq !== bSeq) return aSeq - bSeq;
    return a.id - b.id;
  });
}

/** The unassigned pool plus everything in flight, for a supervisor. */
export async function board({
  branchId = null, status = null, taskType = null, assignedUserId = null,
  openOnly = true, limit = 200, offset = 0,
} = {}) {
  const where = { detstatus: false };
  if (branchId) where.branchId = branchId;
  if (taskType) where.taskType = taskType;
  if (assignedUserId) where.assignedUserId = assignedUserId;
  if (status) where.status = status;
  else if (openOnly) where.status = { [Op.notIn]: CLOSED_TASK_STATUSES };

  const { rows, count } = await WarehouseTask.findAndCountAll({
    where, include: INCLUDES, limit, offset, order: [['id', 'DESC']],
  });
  return { rows, count };
}

/**
 * Labour productivity: what each person actually got through.
 *
 * Averages are taken over completed tasks with a real start time. A task
 * assigned on Friday and finished on Monday would otherwise report a
 * three-day pick and make the whole figure meaningless.
 */
export async function productivity({ branchId = null, from = null, to = null } = {}) {
  const where = { detstatus: false, status: 'COMPLETED', completedAt: { [Op.ne]: null } };
  if (branchId) where.branchId = branchId;
  if (from || to) {
    where.completedAt = {};
    if (from) where.completedAt[Op.gte] = new Date(from);
    if (to) where.completedAt[Op.lte] = new Date(`${to}T23:59:59`);
  }

  const rows = await WarehouseTask.findAll({
    where,
    include: [{ model: User, as: 'assignedTo', attributes: ['id', 'name'], required: false }],
  });

  const byUser = new Map();
  for (const task of rows) {
    const key = task.assignedUserId || 0;
    if (!byUser.has(key)) {
      byUser.set(key, {
        userId: task.assignedUserId,
        name: task.assignedTo?.name || 'Unassigned',
        tasks: 0,
        units: 0,
        byType: {},
        totalSeconds: 0,
        timedTasks: 0,
      });
    }
    const entry = byUser.get(key);
    entry.tasks += 1;
    entry.units += Number(task.completedQuantity || 0);
    entry.byType[task.taskType] = (entry.byType[task.taskType] || 0) + 1;

    if (task.startedAt && task.completedAt) {
      const seconds = (new Date(task.completedAt) - new Date(task.startedAt)) / 1000;
      if (seconds >= 0) {
        entry.totalSeconds += seconds;
        entry.timedTasks += 1;
      }
    }
  }

  return [...byUser.values()]
    .map((entry) => ({
      ...entry,
      averageSecondsPerTask: entry.timedTasks
        ? Math.round(entry.totalSeconds / entry.timedTasks)
        : null,
      unitsPerHour: entry.totalSeconds > 0
        ? Math.round((entry.units / entry.totalSeconds) * 3600 * 10) / 10
        : null,
    }))
    .sort((a, b) => b.tasks - a.tasks);
}

/** Open counts by type and status, for the supervisor tile. */
export async function summary(branchId = null) {
  const where = { detstatus: false, status: { [Op.notIn]: CLOSED_TASK_STATUSES } };
  if (branchId) where.branchId = branchId;

  const rows = await WarehouseTask.findAll({
    where, attributes: ['taskType', 'status', 'priority'], raw: true,
  });

  const countBy = (key) => rows.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] || 0) + 1;
    return acc;
  }, {});

  return {
    open: rows.length,
    unassigned: rows.filter((r) => r.status === 'CREATED').length,
    inProgress: rows.filter((r) => r.status === 'IN_PROGRESS').length,
    byType: countBy('taskType'),
    byStatus: countBy('status'),
    byPriority: countBy('priority'),
  };
}

export const VOCABULARY = {
  types: TASK_TYPES,
  statuses: TASK_STATUSES,
  priorities: TASK_PRIORITIES,
  transitions: TASK_TRANSITIONS,
};
