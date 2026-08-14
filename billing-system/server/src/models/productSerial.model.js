import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const SERIAL_STATUSES = ['In Stock', 'Sold', 'In Transit', 'Returned', 'Damaged', 'Scrapped'];

/**
 * One physical unit, tracked individually.
 *
 * A serial has a location and a status rather than a quantity: it is somewhere,
 * or it has been sold. Its history — purchased on this GRN, moved on that
 * transfer, sold on this invoice, to this customer — is what a warranty claim
 * is answered from.
 */
export default (sequelize) => sequelize.define('ProductSerial', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  serialNumber: { type: DataTypes.STRING(120), allowNull: false },
  // Null once sold — it is no longer at any of our locations.
  branchId: { type: unsignedInteger(sequelize), allowNull: true },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  status: { ...enumType(sequelize, SERIAL_STATUSES), allowNull: false, defaultValue: 'In Stock' },

  // Where it came from.
  grnId: { type: unsignedInteger(sequelize), allowNull: true },
  purchaseId: { type: unsignedInteger(sequelize), allowNull: true },
  supplierId: { type: unsignedInteger(sequelize), allowNull: true },
  purchaseCost: { type: DataTypes.DECIMAL(14, 2), allowNull: true },

  // Where it went.
  invoiceId: { type: unsignedInteger(sequelize), allowNull: true },
  customerId: { type: unsignedInteger(sequelize), allowNull: true },
  soldAt: { type: DataTypes.DATE, allowNull: true },
  warrantyMonths: { type: DataTypes.INTEGER, allowNull: true },
  warrantyExpiry: { type: DataTypes.DATEONLY, allowNull: true },
  remarks: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'product_serials',
  indexes: [
    { fields: ['product_id'] },
    { fields: ['serial_number'] },
    { fields: ['branch_id'] },
    { fields: ['status'] }
  ]
});
