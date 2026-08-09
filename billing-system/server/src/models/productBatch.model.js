import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * A lot of a seed product held at one branch.
 *
 * Indian seed sales are sold by lot: the bill has to carry the lot number,
 * germination percentage and the date the lot stops being valid for sowing.
 * Quantities live here as well as in `branch_stock` — the branch row stays the
 * authority for "how much is there", and the batches say which lots make it up.
 */
export default (sequelize) => sequelize.define('ProductBatch', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },

  batchNumber: { type: DataTypes.STRING(60), allowNull: false },
  lotNumber: { type: DataTypes.STRING(60), allowNull: true },
  // Seed law prints this on the bag and the bill.
  germinationPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  purity: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  packingDate: { type: DataTypes.DATEONLY, allowNull: true },
  testDate: { type: DataTypes.DATEONLY, allowNull: true },
  // Sowing validity. Null means the lot does not expire.
  expiryDate: { type: DataTypes.DATEONLY, allowNull: true },

  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  purchaseRate: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  supplierName: { type: DataTypes.STRING(150), allowNull: true },
  notes: { type: DataTypes.STRING(255), allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'product_batches',
  indexes: [
    { fields: ['product_id'] },
    { fields: ['branch_id'] },
    { fields: ['expiry_date'] },
    // Batch numbers repeat across products, so uniqueness is per product/branch.
    // Not enforced in the database: a deleted lot must free its number, which
    // MySQL unique indexes cannot express alongside soft deletes.
    { fields: ['product_id', 'branch_id', 'batch_number'] }
  ]
});
