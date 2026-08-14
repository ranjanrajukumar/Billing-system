import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const COUNT_STATUSES = ['Draft', 'Counting', 'Pending', 'Approved', 'Cancelled'];

/**
 * How much of the warehouse this count covers.
 *
 * A full stock take shuts the place down, so real warehouses mostly *cycle
 * count*: a bin or an aisle at a time, continuously, without stopping work.
 * Scoping a count to a bin is what makes that possible.
 */
export const COUNT_SCOPES = ['Location', 'Zone', 'Bin'];

/**
 * A physical stock take. The system quantity is frozen onto each line when the
 * sheet is opened, so the variance compares what was counted against what the
 * books said at that moment rather than against a figure that has since moved.
 */
export default (sequelize) => sequelize.define('StockCount', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  countNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  countDate: { type: DataTypes.DATEONLY, allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  status: { ...enumType(sequelize, COUNT_STATUSES), allowNull: false, defaultValue: 'Draft' },
  // 'Location' counts everything held here, as it always has. 'Zone' and 'Bin'
  // narrow it to part of the building for a cycle count.
  scope: { ...enumType(sequelize, COUNT_SCOPES), allowNull: false, defaultValue: 'Location' },
  binId: { type: unsignedInteger(sequelize), allowNull: true },

  countedBy: { type: unsignedInteger(sequelize), allowNull: true },
  approvedBy: { type: unsignedInteger(sequelize), allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  // The adjustment generated when the variance was posted.
  adjustmentId: { type: unsignedInteger(sequelize), allowNull: true },
  remarks: { type: DataTypes.TEXT },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'stock_counts',
  indexes: [{ fields: ['branch_id'] }, { fields: ['status'] }, { fields: ['count_date'] }]
});
