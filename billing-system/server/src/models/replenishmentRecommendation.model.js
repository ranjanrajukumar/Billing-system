import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const REPLENISHMENT_STATUSES = [
  'Pending',    // waiting for somebody to look at it
  'Approved',   // accepted as recommended
  'Modified',   // accepted at a different quantity
  'Rejected',   // deliberately not ordering
  'Ordered',    // turned into a purchase order or transfer
  'Expired',    // superseded by a later run before anyone acted
];

export const REPLENISHMENT_SOURCES = ['Purchase', 'Transfer'];

/**
 * One line of "you should bring in this much of this, here, and here is why".
 *
 * Every input to the arithmetic is stored alongside the answer. A buyer asked
 * to approve an order for 205 units will not do it on trust, and a
 * recommendation that cannot show its working gets ignored no matter how good
 * the model behind it is. The stored figures are also what makes an approved
 * order auditable months later, when stock and forecast have both moved on.
 *
 * Rows are generated in runs and superseded rather than updated in place, so
 * the recommendation somebody approved is still readable after the next run
 * has produced a different number.
 */
export default (sequelize) => sequelize.define('ReplenishmentRecommendation', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  runId: { type: DataTypes.STRING(40), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },

  // ---- The working ----
  // Stock physically present, and the part of it already promised to somebody.
  currentStock: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  reservedStock: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  // On order and not yet received: open purchase orders plus transfers in
  // transit to this location. Ignoring this is how a line gets ordered twice.
  incomingStock: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  // Forecast demand across the horizon the order has to cover, which is lead
  // time plus review period, not an arbitrary month.
  forecastQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  horizonDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  // The policy figures as they stood when this line was generated.
  safetyStock: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  reorderPoint: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  leadTimeDays: { type: DataTypes.INTEGER, allowNull: true },

  // ---- The answer ----
  // Before rounding to a case size or order minimum.
  rawRequiredQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  // What is actually being proposed, after order multiples and minimums.
  recommendedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  // What a person settled on, when they changed it.
  approvedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: true },

  // How urgent this is: days of cover left at the forecast rate. Negative or
  // zero means the shelf is already empty or will be before anything arrives.
  daysOfCover: { type: DataTypes.DECIMAL(9, 2), allowNull: true },
  urgency: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Normal' },

  // ---- Where it comes from ----
  sourceType: { ...enumType(sequelize, REPLENISHMENT_SOURCES), allowNull: false, defaultValue: 'Purchase' },
  // For a transfer: the location with the spare stock.
  sourceBranchId: { type: unsignedInteger(sequelize), allowNull: true },
  supplierId: { type: unsignedInteger(sequelize), allowNull: true },
  estimatedCost: { type: DataTypes.DECIMAL(14, 2), allowNull: true },

  // A sentence a buyer can read, assembled when the line is generated.
  rationale: { type: DataTypes.STRING(500), allowNull: true },

  // ---- Disposition ----
  status: { ...enumType(sequelize, REPLENISHMENT_STATUSES), allowNull: false, defaultValue: 'Pending' },
  decidedBy: { type: DataTypes.INTEGER, allowNull: true },
  decidedAt: { type: DataTypes.DATE, allowNull: true },
  decisionNote: { type: DataTypes.STRING(255), allowNull: true },
  // What the approval became, once raised.
  purchaseOrderId: { type: unsignedInteger(sequelize), allowNull: true },
  stockTransferId: { type: unsignedInteger(sequelize), allowNull: true },

  generatedAt: { type: DataTypes.DATE, allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'replenishment_recommendations',
  indexes: [
    { unique: true, name: 'replenishment_run_grain', fields: ['run_id', 'product_id', 'branch_id'] },
    { fields: ['status'] },
    { fields: ['branch_id', 'status'] },
    { fields: ['product_id'] },
  ],
});
