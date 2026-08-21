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
  // Which packaged size this balance is, or 0 for the product's loose/base
  // stock. This is what keeps packaged and bulk independently traceable while
  // both live in one table: the 100g pouches, the 250g pouches and the open
  // bucket are three balances of one product at one location, not three
  // products and not one blended number.
  //
  // 0 rather than NULL because this column is part of the unique key, and MySQL
  // and SQL Server both treat NULLs in a unique key as distinct — which would
  // let a location accumulate several "loose stock" rows for the same product.
  // Being a sentinel, it carries no foreign key; see dropSentinelForeignKeys.
  variantId: { type: unsignedInteger(sequelize), allowNull: false, defaultValue: 0 },
  // Decimal, not integer. Stock is held in the product's base unit, and a base
  // unit is not always a countable thing: seed sold loose by the gram, cable by
  // the metre, oil by the litre. An integer column silently rounds — MySQL
  // turns 0.5 into 1 and 0.4 into 0 — so a shop selling 100g out of a 50kg
  // bucket would either be given free stock or charged for stock it still has.
  // Four decimal places covers gram precision on a kilogram base and leaves
  // room for the fractional cases without inviting float drift.
  stock: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 0 },
  // Quantity locked by confirmed Sales Orders waiting for invoice confirmation.
  // available = stock − reservedQuantity — this is what availability checks use.
  // On invoice confirmation the reservation is consumed: both columns decrease together.
  reservedQuantity: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 0 },

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
    // at the same location are two balances, not one. Variant likewise: the
    // 100g pouches and the loose bucket are separate balances of one product.
    { unique: true, name: 'branch_stock_grain', fields: ['branch_id', 'product_id', 'variant_id', 'owner_id'] },
    { fields: ['product_id'] },
    { fields: ['owner_id'] }
  ]
});
