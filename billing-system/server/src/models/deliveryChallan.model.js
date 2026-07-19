import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('DeliveryChallan', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  challanNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  challanDate: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('Pending', 'Delivered', 'Returned'), defaultValue: 'Pending' },
  vehicleNumber: { type: DataTypes.STRING(100) },
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
  tableName: 'delivery_challans'
});
