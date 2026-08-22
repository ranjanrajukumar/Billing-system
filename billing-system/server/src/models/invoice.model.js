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

  // Multi-currency and Subscriptions support
  currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
  exchangeRate: { type: DataTypes.DECIMAL(12, 4), defaultValue: 1.0000 },
  subscriptionId: { type: unsignedInteger(sequelize) },

  // The sales order this bill was raised against, when it came from one.
  //
  // This is the seam between billing and the warehouse: it is what lets a bill
  // know whether the goods have already left the building at dispatch — in
  // which case the invoice is a financial document and must not move stock a
  // second time — or are still on the shelf under a reservation this bill is
  // the one to consume. Null for a counter sale, which has no order behind it.
  salesOrderId: { type: unsignedInteger(sequelize) },
  emailStatus: { ...enumType(sequelize, ['Pending', 'Sent', 'Failed']), defaultValue: 'Pending' },

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
  // No index on invoice_number here: the column is already `unique: true`,
  // which creates one. Declaring both makes sync try to add a second index on
  // the same column every boot, and whether that succeeds depends on whether
  // the duplicate-index sweep happened to remove it first — so the process
  // crashes on some starts and not others, with a "Duplicate key name" error
  // that points at the symptom rather than the two declarations causing it.
  indexes: [{ fields: ['invoice_date'] }, { fields: ['sales_order_id'] }]
});
