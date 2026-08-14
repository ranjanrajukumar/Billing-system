import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('BankAccount', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  accountName: { type: DataTypes.STRING(160), allowNull: false },
  bankName: { type: DataTypes.STRING(160), allowNull: true },
  accountNumber: { type: DataTypes.STRING(60), allowNull: true },
  ifsc: { type: DataTypes.STRING(20), allowNull: true },
  branchName: { type: DataTypes.STRING(160), allowNull: true },
  // Which location this account belongs to; null means company-wide.
  branchId: { type: unsignedInteger(sequelize), allowNull: true },
  openingBalance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  currentBalance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  notes: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'bank_accounts',
  indexes: [{ fields: ['branch_id'] }]
});
