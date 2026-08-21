import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * A unit of warehouse work: move this, count that, go and fetch the other.
 *
 * Everything a person does on the floor becomes a row here, whatever prompted
 * it. That is the point — until the work is a record rather than an instruction
 * shouted across a warehouse, nothing can be measured, queued, handed over at
 * shift change, or picked up when somebody goes home mid-job.
 *
 * It is also what labour productivity is computed from. `startedAt` and
 * `completedAt` are not decoration: the gap between them, per person and per
 * task type, is the only honest answer to how long picking actually takes.
 *
 * Guarding against double completion matters more here than it looks. Two
 * scanners completing the same putaway would, if each moved stock, move it
 * twice. `completedAt` therefore acts as the guard — a conditional update that
 * only succeeds while it is still null.
 */
export const TASK_TYPES = [
  'PUTAWAY', 'PICK', 'REPLENISHMENT', 'CYCLE_COUNT', 'TRANSFER', 'PACK', 'LOAD', 'UNLOAD',
];

export const TASK_STATUSES = [
  'CREATED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED',
];

export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

/** Work that is finished, one way or another. */
export const CLOSED_TASK_STATUSES = ['COMPLETED', 'CANCELLED', 'FAILED'];

/**
 * Which moves are allowed. Anything not listed is refused, so a task cannot go
 * from COMPLETED back to IN_PROGRESS and quietly become re-doable.
 */
export const TASK_TRANSITIONS = {
  // Work can fail before anybody starts it: the aisle is blocked, the pallet is
  // not where the task says, the product has already gone. Forcing a picker to
  // start a task they can see is impossible, purely to be allowed to fail it,
  // teaches them to cancel instead — and a cancelled task looks like a change of
  // plan rather than a problem worth investigating.
  CREATED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED', 'FAILED'],
  ASSIGNED: ['IN_PROGRESS', 'CREATED', 'CANCELLED', 'FAILED'],
  IN_PROGRESS: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  // Retryable: a blocked aisle gets cleared and the same task is handed out again.
  FAILED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
};

export default (sequelize) => sequelize.define('WarehouseTask', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  // Uniqueness lives in the indexes block below, declared once.
  taskNumber: { type: DataTypes.STRING(40), allowNull: true },
  taskType: { ...enumType(sequelize, TASK_TYPES), allowNull: false },

  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  sourceBinId: { type: unsignedInteger(sequelize), allowNull: true },
  destinationBinId: { type: unsignedInteger(sequelize), allowNull: true },

  productId: { type: unsignedInteger(sequelize), allowNull: true },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  ownerId: { type: unsignedInteger(sequelize), allowNull: true },

  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  // What was actually done, which is not always what was asked. A pick task for
  // ten that yielded eight is completed with eight and an exception raised.
  completedQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },

  priority: { ...enumType(sequelize, TASK_PRIORITIES), allowNull: false, defaultValue: 'NORMAL' },
  status: { ...enumType(sequelize, TASK_STATUSES), allowNull: false, defaultValue: 'CREATED' },

  assignedUserId: { type: unsignedInteger(sequelize), allowNull: true },

  // Where the work came from — the order, transfer or count that needed it.
  referenceType: { type: DataTypes.STRING(40), allowNull: true },
  referenceId: { type: unsignedInteger(sequelize), allowNull: true },

  // The walk position of the source bin, copied at creation. Denormalised on
  // purpose: a picker's task list is sorted by it on every refresh, and joining
  // to the bin tree to sort a list is a cost paid on the busiest query there is.
  pickSequence: { type: DataTypes.INTEGER, allowNull: true },

  instructions: { type: DataTypes.STRING(500), allowNull: true },
  failureReason: { type: DataTypes.STRING(500), allowNull: true },

  assignedAt: { type: DataTypes.DATE, allowNull: true },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  // Doubles as the double-completion guard: completion only succeeds while this
  // is still null, so two devices racing to finish one task resolve to one.
  completedAt: { type: DataTypes.DATE, allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'warehouse_tasks',
  indexes: [
    // "What should I do next" — a picker's list, in walking order.
    { fields: ['assigned_user_id', 'status', 'pick_sequence'] },
    // The unassigned pool a supervisor allocates from.
    { fields: ['branch_id', 'status', 'priority'] },
    { fields: ['task_type', 'status'] },
    { fields: ['reference_type', 'reference_id'] },
    // Productivity reporting: work finished per person over a period.
    { fields: ['assigned_user_id', 'completed_at'] },
    { unique: true, name: 'warehouse_tasks_number', fields: ['task_number'] }
  ]
});
