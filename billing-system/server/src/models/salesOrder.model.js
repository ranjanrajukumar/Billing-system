import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('SalesOrder', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  orderNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  orderDate: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('Pending', 'Approved', 'Shipped', 'Delivered', 'Cancelled'), defaultValue: 'Pending' },

  // ---- Warehouse fulfilment ----
  // Kept apart from `status`, which is the commercial state of the order.
  // Where the goods have got to is a different question from whether the order
  // is agreed, and merging them makes both harder to read.
  fulfilmentStatus: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'Pending',
  },
  // Which location is shipping it. Null until somebody starts fulfilling.
  fulfilFromBranchId: { type: DataTypes.INTEGER, allowNull: true },

  courier: { type: DataTypes.STRING(120), allowNull: true },
  trackingNumber: { type: DataTypes.STRING(80), allowNull: true },
  dispatchedAt: { type: DataTypes.DATE, allowNull: true },
  deliveredAt: { type: DataTypes.DATE, allowNull: true },
  totalAmount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  notes: { type: DataTypes.TEXT },
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true },
  
  waveId: { type: unsignedInteger(sequelize), allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'sales_orders'
});
