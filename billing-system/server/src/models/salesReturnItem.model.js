import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('SalesReturnItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  quantity: { type: DataTypes.FLOAT, allowNull: false },
  refundAmount: { type: DataTypes.FLOAT, allowNull: false },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'sales_return_items'
});
