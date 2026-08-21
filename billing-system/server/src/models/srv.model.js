import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const SRV_STATUSES = ['Draft', 'Posted', 'Cancelled'];

/**
 * Store Receipt Voucher (SRV) — direct stock receipt not linked to a PO.
 */
export default (sequelize) => sequelize.define('Srv', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  srvNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  srvDate: { type: DataTypes.DATEONLY, allowNull: false },
  supplierId: { type: unsignedInteger(sequelize), allowNull: true },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  status: { ...enumType(sequelize, SRV_STATUSES), allowNull: false, defaultValue: 'Draft' },

  supplierInvoiceNo: { type: DataTypes.STRING(60) },
  supplierInvoiceDate: { type: DataTypes.DATEONLY },
  transporter: { type: DataTypes.STRING(120) },
  vehicleNo: { type: DataTypes.STRING(40) },
  lrNumber: { type: DataTypes.STRING(60) },

  receivedBy: { type: unsignedInteger(sequelize), allowNull: true },
  // Set once the receipt has been posted to stock; posting is one-way.
  postedAt: { type: DataTypes.DATE, allowNull: true },
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
  tableName: 'srvs',
  indexes: [{ fields: ['supplier_id'] }, { fields: ['branch_id'] }, { fields: ['status'] }]
});
