import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('PurchaseReturnItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  returnId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  purchaseItemId: { type: unsignedInteger(sequelize), allowNull: true },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  batchNumber: { type: DataTypes.STRING(60), allowNull: true },

  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  rate: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  gstPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  gstAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  um: { type: DataTypes.STRING(20), allowNull: true },
  primaryUnit: { type: DataTypes.STRING(20), allowNull: true },
  unitConversionFactor: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
  primaryQty: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  reason: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'purchase_return_items',
  indexes: [{ fields: ['return_id'] }, { fields: ['product_id'] }]
});
