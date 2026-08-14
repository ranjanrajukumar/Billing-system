import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const PO_STATUSES = [
  'Draft', 'Pending Approval', 'Approved', 'Rejected',
  'Partially Received', 'Received', 'Closed', 'Cancelled',
];

/**
 * An order placed on a supplier. It is a commitment, not a receipt: nothing
 * touches stock here. Goods arrive through a GRN, which is what lets one order
 * be delivered in several parts and stay open until the balance shows up.
 */
export default (sequelize) => sequelize.define('PurchaseOrder', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  poNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  poDate: { type: DataTypes.DATEONLY, allowNull: false },
  expectedDate: { type: DataTypes.DATEONLY, allowNull: true },
  supplierId: { type: unsignedInteger(sequelize), allowNull: false },
  // Where the goods are to be delivered — a branch or a warehouse.
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  status: { ...enumType(sequelize, PO_STATUSES), allowNull: false, defaultValue: 'Draft' },

  subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  taxAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  grandTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

  approvedBy: { type: unsignedInteger(sequelize), allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  rejectionReason: { type: DataTypes.STRING(255) },
  createdBy: { type: unsignedInteger(sequelize), allowNull: true },
  terms: { type: DataTypes.TEXT },
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
  tableName: 'purchase_orders',
  indexes: [{ fields: ['supplier_id'] }, { fields: ['branch_id'] }, { fields: ['status'] }, { fields: ['po_date'] }]
});
