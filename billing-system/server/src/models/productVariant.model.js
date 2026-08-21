import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * A packaged size of a product — the 100g pouch as distinct from the 250g one.
 *
 * A variant is a separate sellable thing with its own barcode, price, cost and
 * stock, but it is *not* a separate product: it shares the master's name,
 * category, tax, supplier and reporting identity. Duplicating the product per
 * pack size is the usual shortcut and it breaks every roll-up — "how much
 * cauliflower seed do we hold" stops being answerable once the answer is spread
 * across four unrelated product rows.
 *
 * `packSize` is what ties the two worlds together: it records how much base
 * stock one sealed pack represents, so a 100g pouch is 100 base units of the
 * same substance the bulk bucket holds. That is what makes repackaging — break
 * a bucket into pouches — a conversion the ledger can express rather than a
 * write-off and a fresh receipt.
 *
 * Pack stock and bulk stock stay independently traceable regardless: selling a
 * pouch must never quietly draw down the loose bucket, because the pouch is
 * physically on a different shelf. They meet only through an explicit
 * repackaging movement.
 */
export default (sequelize) => sequelize.define('ProductVariant', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  productId: { type: unsignedInteger(sequelize), allowNull: false },

  // What a customer is shown: "100g", "500ml", "Large / Red".
  variantName: { type: DataTypes.STRING(80), allowNull: false },
  sku: { type: DataTypes.STRING(60), allowNull: true },
  barcode: { type: DataTypes.STRING(60), allowNull: true },

  // How much base stock one pack contains. A 100g pouch of a gram-based
  // product is 100. Null for variants that are not a measured quantity —
  // colour or size on a garment — which are counted as pieces.
  packSize: { type: DataTypes.DECIMAL(18, 4), allowNull: true },
  packUnitCode: { type: DataTypes.STRING(20), allowNull: true },

  // Attribute pairs for non-measured variants, as [{name, value}].
  attributes: { type: DataTypes.TEXT, allowNull: true },

  sellingPrice: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  purchasePrice: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  mrp: { type: DataTypes.DECIMAL(14, 4), allowNull: true },

  // Planning parameters, per variant: a 100g pouch and a 1kg bag sell at
  // completely different rates and cannot share a reorder level.
  reorderLevel: { type: DataTypes.DECIMAL(18, 4), allowNull: true },
  minimumStock: { type: DataTypes.DECIMAL(18, 4), allowNull: true },

  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'product_variants',
  indexes: [
    { fields: ['product_id'] },
    // Not unique: a soft-deleted variant keeps its code, and re-issuing a
    // barcode after a line is discontinued is ordinary. Uniqueness among live
    // rows is enforced in the service, where "live" is knowable.
    { fields: ['sku'] },
    { fields: ['barcode'] },
  ],
});
