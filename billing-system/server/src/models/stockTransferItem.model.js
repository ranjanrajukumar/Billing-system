import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * One product on a transfer. `dispatchedQty` and `receivedQty` are tracked
 * separately from the requested quantity so a short receipt (breakage, a bag
 * left behind) is visible rather than silently reconciled.
 */
export default (sequelize) => sequelize.define('StockTransferItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  transferId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  batchNumber: { type: DataTypes.STRING(60), allowNull: true },
  serialNumber: { type: DataTypes.STRING(120), allowNull: true },

  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  dispatchedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  receivedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  damagedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  unitCost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  um: { type: DataTypes.STRING(20), allowNull: true },
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
  tableName: 'stock_transfer_items',
  indexes: [{ fields: ['transfer_id'] }, { fields: ['product_id'] }]
});
