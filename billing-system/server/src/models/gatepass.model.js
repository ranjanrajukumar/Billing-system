import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Gatepass', {
  id: { type: unsignedInteger(sequelize), primaryKey: true, autoIncrement: true },
  
  gatepassNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  gatepassType: enumType(sequelize, ['Inward', 'Outward'], 20),
  gatepassDate: { type: DataTypes.DATEONLY, allowNull: false },
  
  // What is this gatepass for? (e.g., PO-2026-001, INV-2026-001, Manual)
  referenceNumber: { type: DataTypes.STRING(100) },
  referenceType: { type: DataTypes.STRING(50) }, // 'Invoice', 'PurchaseOrder', 'DeliveryChallan', 'Manual'
  
  // Transport Details
  vehicleNumber: { type: DataTypes.STRING(50) },
  driverName: { type: DataTypes.STRING(100) },
  driverContact: { type: DataTypes.STRING(50) },
  transporterName: { type: DataTypes.STRING(100) },
  
  // Status and Tracking
  status: enumType(sequelize, ['Pending', 'Checked-In', 'Checked-Out', 'Cancelled'], 20),
  checkInTime: { type: DataTypes.DATE },
  checkOutTime: { type: DataTypes.DATE },
  
  notes: { type: DataTypes.TEXT },
  
  // Standard fields
  branchId: { type: unsignedInteger(sequelize) },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  authadd: { type: unsignedInteger(sequelize) },
  authlstedit: { type: unsignedInteger(sequelize) },
  authdel: { type: unsignedInteger(sequelize) },
  addondt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  editondt: { type: DataTypes.DATE },
  delondt: { type: DataTypes.DATE }
}, {
  tableName: 'gatepasses',
  timestamps: false
});
