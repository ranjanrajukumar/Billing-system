import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

// 'Invoiced' is a purchase raised from a GRN: the goods already entered stock
// when they were received, so this document is financial only. Cancelling one
// must not reverse stock a second time, which the 'Received' check relies on.
const purchaseStatuses = ['Draft', 'Received', 'Invoiced', 'Cancelled'];
const paymentStatuses = ['Unpaid', 'Partially Paid', 'Paid'];

export default (sequelize) => sequelize.define('Purchase', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  purchaseNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  purchaseDate: { type: DataTypes.DATEONLY, allowNull: false },
  subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  taxAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  grandTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  paidAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  status: { ...enumType(sequelize, purchaseStatuses), defaultValue: 'Received' },
  paymentStatus: { ...enumType(sequelize, paymentStatuses), defaultValue: 'Unpaid' },
  notes: { type: DataTypes.TEXT }
,
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'purchases',
  indexes: [{ fields: ['purchase_number'] }, { fields: ['purchase_date'] }]
});
