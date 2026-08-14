import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const ADJUSTMENT_REASONS = [
  'Damage', 'Expired', 'Theft/Loss', 'Found', 'Opening Stock',
  'Stock Count', 'Correction', 'Sample/Free Issue', 'Other',
];

export const ADJUSTMENT_STATUSES = ['Draft', 'Pending', 'Approved', 'Rejected', 'Cancelled'];

/**
 * A deliberate correction to stock outside the normal buy/sell flow. It only
 * touches stock once approved, so writing off inventory always leaves a named
 * approver behind it.
 */
export default (sequelize) => sequelize.define('StockAdjustment', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  adjustmentNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  adjustmentDate: { type: DataTypes.DATEONLY, allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  reason: { ...enumType(sequelize, ADJUSTMENT_REASONS), allowNull: false, defaultValue: 'Correction' },
  status: { ...enumType(sequelize, ADJUSTMENT_STATUSES), allowNull: false, defaultValue: 'Draft' },
  referenceType: { type: DataTypes.STRING(40), allowNull: true },
  referenceId: { type: unsignedInteger(sequelize), allowNull: true },

  approvedBy: { type: unsignedInteger(sequelize), allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  totalValue: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
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
  tableName: 'stock_adjustments',
  indexes: [{ fields: ['branch_id'] }, { fields: ['status'] }, { fields: ['adjustment_date'] }]
});
