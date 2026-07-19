import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

const paymentMethods = ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit'];

export default (sequelize) => sequelize.define('Payment', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  paymentMethod: { ...enumType(sequelize, paymentMethods), allowNull: false },
  paidAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  referenceNumber: { type: DataTypes.STRING(80) }
,
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt', tableName: 'payments' });
