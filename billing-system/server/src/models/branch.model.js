import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Branch', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  branchName: { type: DataTypes.STRING(160), allowNull: false },
  branchCode: { type: DataTypes.STRING(20), allowNull: false, unique: true },
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
  indexes: [{ fields: ['branch_code'] }]
});
