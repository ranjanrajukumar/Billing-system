import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * A line on a purchase order. `receivedQty` accumulates across every GRN
 * raised against the order, which is how a partial delivery stays partial:
 * ordered 100, received 90, 10 still outstanding.
 */
export default (sequelize) => sequelize.define('PurchaseOrderItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  poId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },

  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  receivedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  rate: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  discount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  gstPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  gstAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  um: { type: DataTypes.STRING(20), allowNull: true },
  primaryUnit: { type: DataTypes.STRING(20), allowNull: true },
  unitConversionFactor: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
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
  tableName: 'purchase_order_items',
  indexes: [{ fields: ['po_id'] }, { fields: ['product_id'] }]
});
