import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * Things that went wrong on the floor, as work somebody owns.
 *
 * Warehouses do not run cleanly. A bin holds nine where the system says ten, a
 * supplier sends more than was ordered, a carton arrives crushed. What matters
 * is not that these happen but that each becomes a piece of work with a name
 * against it — otherwise the picker shrugs, moves on, and the discrepancy is
 * discovered at stock-take when nobody can remember anything about it.
 *
 * An exception is deliberately *not* a correction. Recording that a bin was
 * short does not change any balance; resolving it might, but that is a separate,
 * deliberate act by somebody with the authority. Keeping the report and the fix
 * apart is what stops a mis-scan from silently rewriting stock.
 */
export const EXCEPTION_TYPES = [
  'SHORT_PICK',      // less in the bin than the pick list expected
  'OVER_RECEIPT',    // supplier sent more than the order
  'DAMAGED_STOCK',   // goods unfit to sell
  'WRONG_BIN',       // found somewhere other than where the system says
  'WRONG_PRODUCT',   // the barcode does not match what was expected
  'STOCK_MISMATCH',  // counted quantity disagrees with the system
  'EXPIRED_BATCH',   // past its date and still on the shelf
  'MISSING_SCAN',    // a step was completed without the scan that proves it
  'ENVIRONMENT_BREACH', // a chiller, freezer or curing room left its safe range
];

export const EXCEPTION_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];

export const EXCEPTION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

/** Which exceptions stop being work. Used for queue filters and counts. */
export const CLOSED_EXCEPTION_STATUSES = ['RESOLVED', 'REJECTED'];

export default (sequelize) => sequelize.define('WarehouseException', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  exceptionType: { ...enumType(sequelize, EXCEPTION_TYPES), allowNull: false },

  // What was being done when it came up — 'SalesOrder', 'Grn', 'StockCount'.
  // Loose by design: an exception must be recordable during any operation,
  // including ones added later.
  referenceType: { type: DataTypes.STRING(40), allowNull: true },
  referenceId: { type: unsignedInteger(sequelize), allowNull: true },

  // Where and what. All nullable because a real exception is often raised
  // knowing only some of these — "something is wrong in this bin" is a valid
  // report, and demanding a product id would stop it being made at all.
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  binId: { type: unsignedInteger(sequelize), allowNull: true },
  productId: { type: unsignedInteger(sequelize), allowNull: true },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  ownerId: { type: unsignedInteger(sequelize), allowNull: true },

  expectedQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  actualQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },

  priority: { ...enumType(sequelize, EXCEPTION_PRIORITIES), allowNull: false, defaultValue: 'NORMAL' },
  status: { ...enumType(sequelize, EXCEPTION_STATUSES), allowNull: false, defaultValue: 'OPEN' },

  assignedUserId: { type: unsignedInteger(sequelize), allowNull: true },
  reportedByUserId: { type: unsignedInteger(sequelize), allowNull: true },

  description: { type: DataTypes.STRING(1000), allowNull: true },
  // What was actually done about it. Required to resolve, because "resolved"
  // with no account of how is indistinguishable from ignored.
  resolution: { type: DataTypes.STRING(1000), allowNull: true },
  resolvedByUserId: { type: unsignedInteger(sequelize), allowNull: true },
  resolvedAt: { type: DataTypes.DATE, allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'warehouse_exceptions',
  indexes: [
    // The queue view: open work at this location, worst first.
    { fields: ['branch_id', 'status', 'priority'] },
    { fields: ['assigned_user_id', 'status'] },
    { fields: ['exception_type'] },
    // "What went wrong on this order" — the question asked from the document.
    { fields: ['reference_type', 'reference_id'] },
    { fields: ['product_id'] },
    { fields: ['bin_id'] }
  ]
});
