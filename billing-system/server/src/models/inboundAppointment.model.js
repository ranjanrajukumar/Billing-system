import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('InboundAppointment', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  
  appointmentNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  expectedArrival: { type: DataTypes.DATE, allowNull: false },
  dockNumber: { type: DataTypes.STRING(20), allowNull: true },
  
  status: { 
    type: DataTypes.ENUM('Scheduled', 'Arrived', 'Unloading', 'Completed', 'Cancelled'), 
    defaultValue: 'Scheduled' 
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
  tableName: 'inbound_appointments'
});
