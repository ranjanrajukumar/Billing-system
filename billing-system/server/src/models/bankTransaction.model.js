import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const BANK_ENTRY_TYPES = [
  'Opening', 'Customer Receipt', 'Supplier Payment', 'Expense',
  'Deposit', 'Withdrawal', 'Transfer In', 'Transfer Out', 'Charges', 'Interest', 'Adjustment',
];

export default (sequelize) => sequelize.define('BankTransaction', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  bankAccountId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: true },
  entryType: { ...enumType(sequelize, BANK_ENTRY_TYPES), allowNull: false },
  transactionDate: { type: DataTypes.DATE, allowNull: false },

  amountIn: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  amountOut: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  balance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

  instrumentType: { type: DataTypes.STRING(40) },
  instrumentNo: { type: DataTypes.STRING(60) },
  referenceType: { type: DataTypes.STRING(40) },
  referenceId: { type: unsignedInteger(sequelize) },
  referenceNumber: { type: DataTypes.STRING(60) },
  partyName: { type: DataTypes.STRING(160) },
  isReconciled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
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
  tableName: 'bank_transactions',
  indexes: [
    { fields: ['bank_account_id'] },
    { fields: ['transaction_date'] },
    { fields: ['reference_type', 'reference_id'] }
  ]
});
