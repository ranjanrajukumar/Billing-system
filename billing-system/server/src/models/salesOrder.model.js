import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('SalesOrder', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  orderNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  orderDate: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('Pending', 'Approved', 'Shipped', 'Delivered', 'Cancelled'), defaultValue: 'Pending' },
  totalAmount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  notes: { type: DataTypes.TEXT },
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'sales_orders'
});
