import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * One received line. The quantities are deliberately separate:
 *   received = accepted + rejected + damaged
 * and only `acceptedQty` reaches usable stock.
 */
export default (sequelize) => sequelize.define('GrnItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  grnId: { type: unsignedInteger(sequelize), allowNull: false },
  poItemId: { type: unsignedInteger(sequelize), allowNull: true },
  productId: { type: unsignedInteger(sequelize), allowNull: false },

  orderedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  receivedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  acceptedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  rejectedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  damagedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },

  rate: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  gstPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  um: { type: DataTypes.STRING(20), allowNull: true },
  primaryUnit: { type: DataTypes.STRING(20), allowNull: true },
  unitConversionFactor: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },

  batchNumber: { type: DataTypes.STRING(60), allowNull: true },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  manufacturingDate: { type: DataTypes.DATEONLY, allowNull: true },
  expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
  germinationPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  // Comma-separated on entry; expanded into product_serials on posting.
  serialNumbers: { type: DataTypes.TEXT, allowNull: true },
  rejectionReason: { type: DataTypes.STRING(255) },
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
  tableName: 'grn_items',
  indexes: [{ fields: ['grn_id'] }, { fields: ['product_id'] }, { fields: ['po_item_id'] }]
});
