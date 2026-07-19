import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('SalesOrderItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  quantity: { type: DataTypes.FLOAT, allowNull: false },
  unitPrice: { type: DataTypes.FLOAT, allowNull: false },
  totalPrice: { type: DataTypes.FLOAT, allowNull: false },
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'sales_order_items'
});
