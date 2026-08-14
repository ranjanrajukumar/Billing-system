import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const APPROVAL_DOCUMENTS = [
  'PurchaseOrder', 'StockTransfer', 'StockAdjustment', 'StockCount',
  'Expense', 'Discount', 'PurchaseReturn', 'SalesReturn', 'JournalEntry',
];

export const APPROVAL_OPERATORS = ['>', '>=', '<', '<=', '=='];

/**
 * A configurable "this needs signing off" rule: when <field> of a <document>
 * compares <operator> <threshold>, the named role must approve it.
 *
 * Thresholds belong to the business, not to us — a ₹100,000 purchase order is
 * routine for one company and exceptional for another — so nothing here is
 * hard-coded and every rule is editable from the Approvals screen.
 */
export default (sequelize) => sequelize.define('ApprovalRule', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  documentType: { ...enumType(sequelize, APPROVAL_DOCUMENTS), allowNull: false },
  name: { type: DataTypes.STRING(160), allowNull: false },
  // The numeric field on the document being tested, e.g. grandTotal, quantity,
  // discountPercent. Validated against a whitelist by the approval service.
  field: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'grandTotal' },
  operator: { ...enumType(sequelize, APPROVAL_OPERATORS, 4), allowNull: false, defaultValue: '>' },
  threshold: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
  // Role that must approve. Admin can always approve anything.
  approverRole: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Admin' },
  // Null applies everywhere; set to restrict the rule to one location.
  branchId: { type: unsignedInteger(sequelize), allowNull: true },
  // Lower runs first; the first matching rule decides the approver.
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'approval_rules',
  indexes: [{ fields: ['document_type'] }, { fields: ['is_active'] }]
});
