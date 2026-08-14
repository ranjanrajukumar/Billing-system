import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Supplier', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  supplierName: { type: DataTypes.STRING(160), allowNull: false },
  contactPerson: { type: DataTypes.STRING(120) },
  mobileNumber: { type: DataTypes.STRING(20), allowNull: false },
  email: { type: DataTypes.STRING(160), validate: { isEmail: true } },
  gstNumber: { type: DataTypes.STRING(20) },
  address: { type: DataTypes.TEXT },
  city: { type: DataTypes.STRING(80) },
  state: { type: DataTypes.STRING(80) },
  pincode: { type: DataTypes.STRING(10) },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  // What was already owed to this supplier when they were entered. Positive
  // means we owe them; the supplier ledger starts from this figure.
  openingBalance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  creditDays: { type: DataTypes.INTEGER, allowNull: true }
,
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'suppliers',
  indexes: [{ fields: ['supplier_name'] }, { fields: ['mobile_number'] }, { fields: ['gst_number'] }]
});
