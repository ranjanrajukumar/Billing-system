import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Shipment', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  
  shipmentNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  carrierName: { type: DataTypes.STRING(100), allowNull: true },
  trackingNumber: { type: DataTypes.STRING(100), allowNull: true },
  shippingDate: { type: DataTypes.DATE, allowNull: true },
  
  status: { 
    type: DataTypes.ENUM('Pending', 'InTransit', 'Delivered', 'Cancelled'), 
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
  tableName: 'shipments'
});
