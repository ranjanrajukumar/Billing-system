import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const COUNT_STATUSES = ['Draft', 'Counting', 'Pending', 'Approved', 'Cancelled'];

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
