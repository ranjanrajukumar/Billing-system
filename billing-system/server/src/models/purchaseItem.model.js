import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('PurchaseItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  rate: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  gstPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  gstAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
,
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt', tableName: 'purchase_items' });
