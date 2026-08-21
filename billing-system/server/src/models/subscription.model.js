import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Subscription', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  customerId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
  frequency: { ...enumType(sequelize, ['Daily', 'Weekly', 'Monthly', 'Yearly']), defaultValue: 'Monthly' },
  nextBillingDate: { type: DataTypes.DATEONLY, allowNull: false },
  status: { ...enumType(sequelize, ['Active', 'Paused', 'Cancelled']), defaultValue: 'Active' },
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'subscriptions'
});
