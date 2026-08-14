import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * How much of a product is sitting in one particular bin.
 *
 * This is the missing rung in Warehouse → Zone → Rack → Shelf/Bin → Product.
 * It is deliberately a *sub-allocation* of location stock, never a replacement
 * for it: `branch_stock` remains the single authority for "how much is at this
 * location", and the quantities here say whereabouts in the building it is.
 *
 * The invariant that keeps the two honest:
 *
 *     sum(bin_stock for a product at a location)  ≤  branch_stock
 *
 * The difference is stock that has arrived but not yet been put away — real
 * warehouses have a receiving bay, and pretending otherwise would force a
 * put-away step on businesses that do not want one. A location with no bins at
 * all simply has no rows here and behaves exactly as it always has, which is
 * what makes the whole hierarchy optional for a small shop.
 */
export default (sequelize) => sequelize.define('BinStock', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  binId: { type: unsignedInteger(sequelize), allowNull: false },
  // Denormalised from the bin so location queries never need the tree walk.
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  // Lot-tracked goods are binned per lot, so a picker is told which lot to take.
  batchId: { type: unsignedInteger(sequelize), allowNull: true },

  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'bin_stock',
  indexes: [
    { unique: true, fields: ['bin_id', 'product_id', 'batch_id'] },
    { fields: ['branch_id', 'product_id'] },
    { fields: ['product_id'] }
  ]
});
