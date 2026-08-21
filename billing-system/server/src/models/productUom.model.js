import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * The units one product may be traded in, and what each is worth in its base
 * unit.
 *
 * The conversion lives per product, not on the unit, because a unit name is not
 * a quantity. A bucket of one seed is 10kg and a bucket of another is 5kg; a
 * carton of one FMCG line is 24 and of another is 12. A global "1 BUCKET = 10
 * KG" row would be right for one product and quietly wrong for every other, and
 * wrong in a way that shows up as a stock discrepancy weeks later rather than
 * as an error at the till.
 *
 * `factorToBase` is always "how many base units in one of these", so conversion
 * is a multiply in one direction and never needs inverting at a call site:
 *
 *     base = quantity × factorToBase
 *     1 KG     → factorToBase 1000   (base = gram)
 *     1 BUCKET → factorToBase 10000  (10kg, this product only)
 *     1 G      → factorToBase 1      (the base unit itself)
 *
 * The base unit is the smallest one a product is genuinely traded in, because
 * every balance is held in it: choosing gram over kilogram is what lets a
 * 10g sale be exact rather than 0.01 of something.
 */
export default (sequelize) => sequelize.define('ProductUom', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  productId: { type: unsignedInteger(sequelize), allowNull: false },
  // Matches a code in the Unit master, but the factor here wins for this
  // product — the master is a vocabulary, not a rate card.
  unitCode: { type: DataTypes.STRING(20), allowNull: false },
  unitName: { type: DataTypes.STRING(60), allowNull: true },

  // Six decimal places: a factor can be fractional going the other way (1 G =
  // 0.001 KG if somebody bases a product on kilograms), and rounding the factor
  // rounds every transaction made through it.
  factorToBase: { type: DataTypes.DECIMAL(18, 6), allowNull: false, defaultValue: 1 },

  // Exactly one row per product should carry this, and its factor must be 1.
  isBase: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // What this unit may be used for. A bucket is bought but never sold; a
  // 10g scoop is sold but never bought.
  canPurchase: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  canSell: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  isDefaultPurchase: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  isDefaultSell: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // Offered as a quick-pick button at the till, in this order.
  isQuickPick: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  // Price per one of this unit. Null falls back to the product's price scaled
  // by the factor, so only genuinely non-linear pricing needs a row here — a
  // 1kg pack cheaper than ten 100g scoops, which is ordinary retail.
  sellingPrice: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  purchasePrice: { type: DataTypes.DECIMAL(14, 4), allowNull: true },

  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'product_uoms',
  indexes: [
    { unique: true, name: 'product_uom_grain', fields: ['product_id', 'unit_code'] },
    { fields: ['product_id', 'is_base'] },
  ],
});
