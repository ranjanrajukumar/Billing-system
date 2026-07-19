import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('SalesReturn', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  returnNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  returnDate: { type: DataTypes.DATEONLY, allowNull: false },
  reason: { type: DataTypes.STRING(255) },
  totalRefund: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.ENUM('Pending', 'Completed', 'Rejected'), defaultValue: 'Pending' },
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'sales_returns'
});
