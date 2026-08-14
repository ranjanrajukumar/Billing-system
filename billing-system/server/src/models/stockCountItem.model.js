import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('StockCountItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  countId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  // Set on a cycle count: the line is about this bin, not the whole location.
  binId: { type: unsignedInteger(sequelize), allowNull: true },

  // Frozen when the sheet was created.
  systemQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  // Null until somebody actually counts this line.
  physicalQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  variance: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
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
  tableName: 'stock_count_items',
  indexes: [{ fields: ['count_id'] }, { fields: ['product_id'] }]
});
