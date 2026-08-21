import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const CONTAINER_STATUSES = ['Sealed', 'Open', 'Empty', 'Returned', 'Damaged'];

/**
 * One physical vessel of loose stock — bucket #001, sack #14, drum #7.
 *
 * Optional, and off unless a product asks for it. Most loose stock does not
 * need this: a shop with one open sack of rice can keep a single balance and be
 * right. It earns its place where a container is the unit of traceability —
 * where each drum has its own batch and expiry, where a supplier takes empties
 * back, or where an auditor has to reconcile a shelf vessel by vessel rather
 * than in total.
 *
 * The balance here is a *detail* of the location balance, never a second
 * authority. `branch_stock` remains the one truth for how much exists; these
 * rows say which vessels that total is sitting in. Two places that can both
 * claim to be right will eventually disagree, and then neither is trusted.
 */
export default (sequelize) => sequelize.define('ProductContainer', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  productId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  // Whose goods are in it — a 3PL warehouse holds vessels for several clients.
  ownerId: { type: unsignedInteger(sequelize), allowNull: false, defaultValue: 1 },

  // The label written on the vessel. What somebody reads out over the phone.
  containerCode: { type: DataTypes.STRING(60), allowNull: false },
  containerType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Bucket' },

  // What it held when full, and what is left, both in the product's base unit.
  capacityQty: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 0 },
  remainingQty: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 0 },

  status: { ...enumType(sequelize, CONTAINER_STATUSES), allowNull: false, defaultValue: 'Sealed' },

  // A sealed vessel is countable but not sellable; opening it is the event that
  // makes its contents available to a scoop, and is worth a timestamp because
  // shelf life usually starts there rather than at receipt.
  openedAt: { type: DataTypes.DATE, allowNull: true },
  openedBy: { type: DataTypes.INTEGER, allowNull: true },
  emptiedAt: { type: DataTypes.DATE, allowNull: true },

  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  supplierId: { type: unsignedInteger(sequelize), allowNull: true },
  grnId: { type: unsignedInteger(sequelize), allowNull: true },
  receivedAt: { type: DataTypes.DATE, allowNull: true },
  expiryDate: { type: DataTypes.DATEONLY, allowNull: true },

  binId: { type: unsignedInteger(sequelize), allowNull: true },
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
  tableName: 'product_containers',
  indexes: [
    { unique: true, name: 'container_code_grain', fields: ['branch_id', 'container_code'] },
    { fields: ['product_id', 'branch_id', 'status'] },
    { fields: ['batch_id'] },
  ],
});
