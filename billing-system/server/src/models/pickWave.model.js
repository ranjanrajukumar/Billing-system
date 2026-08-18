import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('PickWave', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  
  waveNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  
  status: { 
    type: DataTypes.ENUM('Planned', 'Released', 'Picking', 'Picked', 'Completed', 'Cancelled'), 
    defaultValue: 'Planned' 
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
  tableName: 'pick_waves'
});
