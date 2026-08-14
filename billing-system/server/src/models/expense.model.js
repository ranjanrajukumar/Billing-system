import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const EXPENSE_STATUSES = ['Draft', 'Pending Approval', 'Approved', 'Paid', 'Rejected', 'Cancelled'];

/**
 * Money spent running the business, booked against a branch or warehouse so
 * branch profitability means something. Approving one is what releases it to
 * the accounts; paying one moves the cash or bank balance.
 */
export default (sequelize) => sequelize.define('Expense', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  expenseNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  expenseDate: { type: DataTypes.DATEONLY, allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  categoryId: { type: unsignedInteger(sequelize), allowNull: true },
  status: { ...enumType(sequelize, EXPENSE_STATUSES), allowNull: false, defaultValue: 'Draft' },

  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  taxAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  totalAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

  paymentMode: { type: DataTypes.STRING(40), allowNull: true },
  // Where the money came out of. Exactly one of these is set when paid.
  cashRegisterId: { type: unsignedInteger(sequelize), allowNull: true },
  bankAccountId: { type: unsignedInteger(sequelize), allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: true },

  payeeName: { type: DataTypes.STRING(160) },
  referenceNo: { type: DataTypes.STRING(60) },
  attachmentPath: { type: DataTypes.STRING(255) },
  approvedBy: { type: unsignedInteger(sequelize), allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  createdBy: { type: unsignedInteger(sequelize), allowNull: true },
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
  tableName: 'expenses',
  indexes: [{ fields: ['branch_id'] }, { fields: ['category_id'] }, { fields: ['expense_date'] }, { fields: ['status'] }]
});
