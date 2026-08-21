import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * The planning parameters for one product at one location.
 *
 * These are deliberately per-location rather than per-product. The same shirt
 * sells four a day in a Mumbai high-street store and four a month in a small
 * town, and holding one safety stock for both either starves the first or
 * strands capital in the second. A product with no row here falls back to the
 * defaults on the product master, so nothing has to be configured before the
 * system is useful — the fallback is in `resolvePolicy`, not in this table.
 *
 * Nothing here is computed on the fly at replenishment time: a buyer needs to
 * be able to look at why an order was recommended, change the lead time, and
 * see the recommendation change. Parameters that live only inside a formula
 * cannot be argued with.
 */
export default (sequelize) => sequelize.define('InventoryPolicy', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  productId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },

  // ---- Stock bounds ----
  // The floor a location should not trade below, and the ceiling above which
  // stock is capital sitting on a shelf.
  minimumStock: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  maximumStock: { type: DataTypes.DECIMAL(14, 3), allowNull: true },

  // Cover for demand being lumpier than the forecast says. Either set by hand
  // or computed from demand variability and the service level below.
  safetyStock: { type: DataTypes.DECIMAL(14, 3), allowNull: true },

  // The level at which an order should be raised. Usually derived
  // (demand over lead time + safety stock) but overridable.
  reorderPoint: { type: DataTypes.DECIMAL(14, 3), allowNull: true },

  // ---- Order sizing ----
  // What a supplier will actually ship: cases of 12, pallets of 480.
  orderMultiple: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  minimumOrderQty: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  economicOrderQty: { type: DataTypes.DECIMAL(14, 3), allowNull: true },

  // ---- Timing ----
  // Days from raising an order to the goods being sellable. The single most
  // important number in replenishment and the one most often wrong.
  leadTimeDays: { type: DataTypes.INTEGER, allowNull: true },
  // How often this line is actually reviewed. Demand during the review period
  // has to be covered too, or a weekly review with a two-day lead time still
  // runs out on day three.
  reviewPeriodDays: { type: DataTypes.INTEGER, allowNull: true },

  // Probability of not stocking out during lead time, as a percentage. Drives
  // the safety-stock calculation when safetyStock is left blank.
  serviceLevelPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },

  // ---- Behaviour ----
  // Whether recommendations for this line may be raised into orders without a
  // person approving each one.
  autoReplenish: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Where a shortfall should be filled from, when both are possible.
  preferredSource: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Auto' },
  preferredSupplierId: { type: unsignedInteger(sequelize), allowNull: true },
  // A line taken out of planning entirely — discontinued, seasonal and out of
  // season, or simply never to be auto-ordered.
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  notes: { type: DataTypes.STRING(255), allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'inventory_policies',
  indexes: [
    { unique: true, name: 'inventory_policy_grain', fields: ['product_id', 'branch_id'] },
    { fields: ['branch_id'] },
  ],
});
