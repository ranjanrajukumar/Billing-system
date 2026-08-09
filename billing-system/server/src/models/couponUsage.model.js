import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/** One row per time a coupon was applied, so limits can be counted per customer. */
export default (sequelize) => sequelize.define('CouponUsage', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  couponId: { type: unsignedInteger(sequelize), allowNull: false },
  customerId: { type: unsignedInteger(sequelize) },
  invoiceId: { type: unsignedInteger(sequelize) },
  discountAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'coupon_usages',
  indexes: [{ fields: ['coupon_id'] }, { fields: ['customer_id'] }, { fields: ['invoice_id'] }]
});
