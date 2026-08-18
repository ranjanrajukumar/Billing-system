import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('QcInspection', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  
  inspectionNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  grnId: { type: unsignedInteger(sequelize), allowNull: true },
  returnId: { type: unsignedInteger(sequelize), allowNull: true },
  returnItemId: { type: unsignedInteger(sequelize), allowNull: true },
  inspectedQty: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  passedQty: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  failedQty: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  
  status: { 
    type: DataTypes.ENUM('Pending', 'Passed', 'Failed', 'Partial'), 
    defaultValue: 'Pending' 
  },
  
  notes: { type: DataTypes.TEXT, allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'qc_inspections'
});
