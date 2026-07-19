import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Company', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(180), allowNull: false },
  gstNumber: { type: DataTypes.STRING(20) },
  email: { type: DataTypes.STRING(160) },
  mobile: { type: DataTypes.STRING(20) },
  address: { type: DataTypes.TEXT },
  city: { type: DataTypes.STRING(80) },
  state: { type: DataTypes.STRING(80), allowNull: false },
  pincode: { type: DataTypes.STRING(10) },
  logoPath: { type: DataTypes.STRING(255) },
  signatureUrl: { type: DataTypes.STRING(255) },
  defaultInvoiceTemplate: { type: DataTypes.STRING(50), defaultValue: 'standard' }
,
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt', tableName: 'company' });
