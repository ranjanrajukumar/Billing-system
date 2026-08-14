import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const CASH_ENTRY_TYPES = [
  'Opening', 'Cash Sale', 'Customer Collection', 'Supplier Payment',
  'Expense', 'Refund', 'Cash In', 'Cash Out', 'Bank Deposit', 'Bank Withdrawal', 'Adjustment',
];

/** Every movement of physical cash through a register, with a running balance. */
export default (sequelize) => sequelize.define('CashTransaction', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  registerId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  entryType: { ...enumType(sequelize, CASH_ENTRY_TYPES), allowNull: false },
  transactionDate: { type: DataTypes.DATE, allowNull: false },

  amountIn: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  amountOut: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  balance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

  referenceType: { type: DataTypes.STRING(40) },
  referenceId: { type: unsignedInteger(sequelize) },
  referenceNumber: { type: DataTypes.STRING(60) },
  partyName: { type: DataTypes.STRING(160) },
  notes: { type: DataTypes.TEXT },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'cash_transactions',
  indexes: [
    { fields: ['register_id'] },
    { fields: ['branch_id'] },
    { fields: ['transaction_date'] },
    { fields: ['reference_type', 'reference_id'] }
  ]
});
