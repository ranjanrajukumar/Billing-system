import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Customer', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  customerName: { type: DataTypes.STRING(160), allowNull: false },
  mobileNumber: { type: DataTypes.STRING(20), allowNull: false },
  email: { type: DataTypes.STRING(160), validate: { isEmail: true } },
  gstNumber: { type: DataTypes.STRING(20) },
  address: { type: DataTypes.TEXT, allowNull: true },
  city: { type: DataTypes.STRING(80), allowNull: true },
  state: { type: DataTypes.STRING(80), allowNull: true },
  pincode: { type: DataTypes.STRING(10), allowNull: true }
,
  // Running loyalty balance; the ledger of changes lives in loyalty_transactions.
  loyaltyPoints: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'customers',
  indexes: [{ fields: ['customer_name'] }, { fields: ['mobile_number'] }, { fields: ['gst_number'] }]
});
