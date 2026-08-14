import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const LOCATION_TYPES = ['Branch', 'Warehouse'];

/**
 * A stock-holding location.
 *
 * Branches and warehouses differ in what they are *for* — a branch sells, a
 * warehouse stores — but not in how stock behaves at them: both hold quantities,
 * both receive and issue, both appear on a transfer. Keeping them in one table
 * with a type discriminator means every stock path (`branch_stock`, movements,
 * transfers, scoping) works for a warehouse without a second implementation.
 */
export default (sequelize) => sequelize.define('Branch', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  branchName: { type: DataTypes.STRING(160), allowNull: false },
  branchCode: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  // Existing rows predate warehouses, so they are branches.
  locationType: { ...enumType(sequelize, LOCATION_TYPES), allowNull: false, defaultValue: 'Branch' },
  // Optional hierarchy, e.g. a branch served by a parent warehouse.
  parentId: { type: unsignedInteger(sequelize), allowNull: true },
  // Warehouses do not bill, so they are excluded from POS and invoice pickers.
  canSell: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  gstNumber: { type: DataTypes.STRING(20) },
  phone: { type: DataTypes.STRING(20) },
  email: { type: DataTypes.STRING(160) },
  address: { type: DataTypes.TEXT },
  city: { type: DataTypes.STRING(80) },
  state: { type: DataTypes.STRING(80) },
  pincode: { type: DataTypes.STRING(10) },
  // Prefix for this branch's invoice numbers, e.g. 'MUM' -> MUM-INV-2026-00001.
  invoicePrefix: { type: DataTypes.STRING(20) },
  // Exactly one branch is the default; it is what single-branch mode uses.
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'branches',
  indexes: [{ fields: ['branch_code'] }, { fields: ['location_type'] }]
});
