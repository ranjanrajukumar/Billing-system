import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

const paymentMethods = ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit'];
const invoiceStatuses = ['Draft', 'Unpaid', 'Paid', 'Partially Paid', 'Cancelled'];

export default (sequelize) => sequelize.define('Invoice', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  invoiceNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  invoiceDate: { type: DataTypes.DATEONLY, allowNull: false },
  // Set for credit (udhar) sales so outstanding amounts can be aged.
  dueDate: { type: DataTypes.DATEONLY },
  paymentMethod: { ...enumType(sequelize, paymentMethods), defaultValue: 'Cash' },
  subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  cgst: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  sgst: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  igst: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  grandTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  roundOff: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  amountInWords: { type: DataTypes.STRING(255), allowNull: false },
  // Coupon and loyalty reductions, both applied before GST.
  couponId: { type: unsignedInteger(sequelize) },
  couponCode: { type: DataTypes.STRING(40) },
  couponDiscount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  pointsRedeemed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  pointsDiscount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  pointsEarned: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status: { ...enumType(sequelize, invoiceStatuses), defaultValue: 'Paid' },
  notes: { type: DataTypes.TEXT },

  // Document references printed on a bill of supply.
  orderNumber: { type: DataTypes.STRING(40) },
  orderDate: { type: DataTypes.DATEONLY },
  dmNumber: { type: DataTypes.STRING(40) },
  dmDate: { type: DataTypes.DATEONLY },
  manualDm: { type: DataTypes.STRING(40) },
  manualDmDate: { type: DataTypes.DATEONLY },

  // Dispatch details.
  transporter: { type: DataTypes.STRING(120) },
  vehicleNo: { type: DataTypes.STRING(30) },
  lrNumber: { type: DataTypes.STRING(40) },
  totalBags: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },

  // The charge and deduction boxes along the foot of the bill.
  quantityDiscount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  cashDiscount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  specialDiscount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  freightDeducted: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  packingCharge: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  freightCharge: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  otherCharges: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  cess: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  remark: { type: DataTypes.STRING(255) }
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
