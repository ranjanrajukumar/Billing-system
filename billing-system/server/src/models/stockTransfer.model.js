import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * Movement of stock between two locations (branch or warehouse, in any
 * combination).
 *
 * The statuses are a real workflow, not decoration: stock leaves the source
 * when it is dispatched and only arrives at the destination when someone
 * receives it. In between it is *in transit* — counted at neither end, which is
 * the honest answer to "where is it" and the reason receiving is a separate step.
 */
export const TRANSFER_STATUSES = [
  'Draft', 'Pending', 'Approved', 'Picked', 'Dispatched', 'InTransit',
  'PartiallyReceived', 'Received', 'Cancelled', 'Rejected',
];

export default (sequelize) => sequelize.define('StockTransfer', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  transferNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  transferDate: { type: DataTypes.DATEONLY, allowNull: false },
  fromBranchId: { type: unsignedInteger(sequelize), allowNull: false },
  toBranchId: { type: unsignedInteger(sequelize), allowNull: false },
  status: { ...enumType(sequelize, TRANSFER_STATUSES), allowNull: false, defaultValue: 'Draft' },

  // Who moved it through the workflow, and when.
  requestedBy: { type: unsignedInteger(sequelize), allowNull: true },
  approvedBy: { type: unsignedInteger(sequelize), allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  dispatchedBy: { type: unsignedInteger(sequelize), allowNull: true },
  dispatchedAt: { type: DataTypes.DATE, allowNull: true },
  receivedBy: { type: unsignedInteger(sequelize), allowNull: true },
  receivedAt: { type: DataTypes.DATE, allowNull: true },

  transporter: { type: DataTypes.STRING(120) },
  vehicleNo: { type: DataTypes.STRING(40) },
  totalQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  totalValue: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  remarks: { type: DataTypes.TEXT },
  rejectionReason: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'stock_transfers',
  indexes: [
    { fields: ['status'] },
    { fields: ['from_branch_id'] },
    { fields: ['to_branch_id'] },
    { fields: ['transfer_date'] }
  ]
});
