import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const GRN_STATUSES = ['Draft', 'Pending QC', 'Completed', 'Cancelled'];

/**
 * Goods Receipt Note — the moment stock physically arrives.
 *
 * Received is not the same as accepted. A delivery can be short, damaged or
 * rejected on inspection, and only the accepted quantity becomes sellable
 * inventory; the rest is recorded so the supplier can be held to it.
 */
export default (sequelize) => sequelize.define('Grn', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  grnNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  grnDate: { type: DataTypes.DATEONLY, allowNull: false },
  poId: { type: unsignedInteger(sequelize), allowNull: true },
  supplierId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  status: { ...enumType(sequelize, GRN_STATUSES), allowNull: false, defaultValue: 'Draft' },

  supplierInvoiceNo: { type: DataTypes.STRING(60) },
  supplierInvoiceDate: { type: DataTypes.DATEONLY },
  transporter: { type: DataTypes.STRING(120) },
  vehicleNo: { type: DataTypes.STRING(40) },
  lrNumber: { type: DataTypes.STRING(60) },

  receivedBy: { type: unsignedInteger(sequelize), allowNull: true },
  // Set once the receipt has been posted to stock; posting is one-way.
  postedAt: { type: DataTypes.DATE, allowNull: true },
  // The purchase invoice raised from this receipt, if any.
  purchaseId: { type: unsignedInteger(sequelize), allowNull: true },
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
  tableName: 'grns',
  indexes: [{ fields: ['po_id'] }, { fields: ['supplier_id'] }, { fields: ['branch_id'] }, { fields: ['status'] }]
});
