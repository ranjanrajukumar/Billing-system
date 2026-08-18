import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('RepairOrder', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  
  repairNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  qcInspectionId: { type: unsignedInteger(sequelize), allowNull: true },
  
  quantity: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  issueDescription: { type: DataTypes.TEXT, allowNull: true },
  repairCost: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
  
  status: { 
    type: DataTypes.ENUM('Pending', 'In Repair', 'Repaired', 'Scrapped'), 
    defaultValue: 'Pending' 
  },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'repair_orders'
});
