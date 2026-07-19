import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

const paymentMethods = ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit'];
const invoiceStatuses = ['Draft', 'Paid', 'Partially Paid', 'Cancelled'];

export default (sequelize) => sequelize.define('Invoice', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  invoiceNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  invoiceDate: { type: DataTypes.DATEONLY, allowNull: false },
  paymentMethod: { ...enumType(sequelize, paymentMethods), defaultValue: 'Cash' },
  subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  cgst: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  sgst: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  igst: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  grandTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  roundOff: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  amountInWords: { type: DataTypes.STRING(255), allowNull: false },
  status: { ...enumType(sequelize, invoiceStatuses), defaultValue: 'Paid' },
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
  tableName: 'invoices',
  indexes: [{ fields: ['invoice_number'] }, { fields: ['invoice_date'] }]
});
