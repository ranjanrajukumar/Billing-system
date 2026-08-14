import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const REGISTER_STATUSES = ['Open', 'Closed'];

/**
 * A till, opened for a shift and closed against a physical count.
 *
 * The difference between what the system says should be in the drawer and what
 * the cashier actually counted is recorded rather than absorbed — a till that
 * always balances exactly is a till nobody is really counting.
 */
export default (sequelize) => sequelize.define('CashRegister', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  registerName: { type: DataTypes.STRING(120), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  status: { ...enumType(sequelize, REGISTER_STATUSES), allowNull: false, defaultValue: 'Open' },

  openedBy: { type: unsignedInteger(sequelize), allowNull: true },
  openedAt: { type: DataTypes.DATE, allowNull: true },
  openingBalance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

  closedBy: { type: unsignedInteger(sequelize), allowNull: true },
  closedAt: { type: DataTypes.DATE, allowNull: true },
  // What the ledger says should be there.
  expectedBalance: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  // What was physically counted.
  closingBalance: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  variance: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
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
  tableName: 'cash_registers',
  indexes: [{ fields: ['branch_id'] }, { fields: ['status'] }]
});
