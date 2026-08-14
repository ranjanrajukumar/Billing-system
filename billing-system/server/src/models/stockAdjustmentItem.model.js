import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/** A signed quantity change for one product; negative writes stock off. */
export default (sequelize) => sequelize.define('StockAdjustmentItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  adjustmentId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  batchNumber: { type: DataTypes.STRING(60), allowNull: true },

  // Signed: +5 found, -5 written off.
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  systemQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  unitCost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  remarks: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'stock_adjustment_items',
  indexes: [{ fields: ['adjustment_id'] }, { fields: ['product_id'] }]
});
