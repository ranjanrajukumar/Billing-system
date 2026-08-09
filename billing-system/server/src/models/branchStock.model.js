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
  stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

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
    { unique: true, fields: ['branch_id', 'product_id'] },
    { fields: ['product_id'] }
  ]
});
