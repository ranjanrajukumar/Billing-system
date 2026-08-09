import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

const discountTypes = ['Percentage', 'Fixed'];

export default (sequelize) => sequelize.define('Coupon', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  // Deliberately not a unique index: a deleted code should be reusable next
  // season. Uniqueness among live coupons is enforced in the controller.
  code: { type: DataTypes.STRING(40), allowNull: false },
  description: { type: DataTypes.STRING(255) },
  discountType: { ...enumType(sequelize, discountTypes), allowNull: false, defaultValue: 'Percentage' },
  discountValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  // Percentage coupons can be capped so a large bill does not give it all away.
  maxDiscount: { type: DataTypes.DECIMAL(12, 2) },
  minOrderValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  validFrom: { type: DataTypes.DATEONLY },
  validTo: { type: DataTypes.DATEONLY },
  // null means unlimited
  usageLimit: { type: DataTypes.INTEGER },
  perCustomerLimit: { type: DataTypes.INTEGER },
  usedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'coupons',
  indexes: [{ fields: ['code'] }, { fields: ['is_active'] }]
});
