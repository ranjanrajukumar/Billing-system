import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * Per-branch quantity for a product. This is the authority for stock; the
 * `products.stock` column is kept as a mirror of the total across branches so
 * existing reports and low-stock checks keep working unchanged.
 */
export default (sequelize) => sequelize.define('BranchStock', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  // Whose goods these are. A shop has one owner — the house — and never thinks
  // about this column; a third-party warehouse holds a separate balance per
  // client at the same location. The default is the house row, which is created
  // before this column is ever written, so existing stock keeps its meaning.
  ownerId: { type: unsignedInteger(sequelize), allowNull: false, defaultValue: 1 },
  stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Quantity locked by confirmed Sales Orders waiting for invoice confirmation.
  // available = stock − reservedQuantity — this is what availability checks use.
  // On invoice confirmation the reservation is consumed: both columns decrease together.
  reservedQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'branch_stock',
  indexes: [
    // Owner is part of the key: sixty of a product yours and forty a client's
    // at the same location are two balances, not one.
    { unique: true, fields: ['branch_id', 'product_id', 'owner_id'] },
    { fields: ['product_id'] },
    { fields: ['owner_id'] }
  ]
});
