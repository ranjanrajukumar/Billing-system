import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const PACKAGE_STATUSES = ['Open', 'Sealed', 'Dispatched', 'Cancelled'];

/**
 * A physical package — a carton, a sack, a bundle — prepared for dispatch.
 *
 * Packing is a separate step from picking because the two answer different
 * questions. Picking asks "is everything off the shelf"; packing asks "how many
 * boxes are going on the lorry, and what is in each". Without the second, a
 * receiver counting three cartons against a transfer of forty items has no way
 * to tell whether anything is missing.
 */
export default (sequelize) => sequelize.define('PackingSlip', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  packageNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  // What is being packed. Transfers today; sales orders use the same table.
  referenceType: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'StockTransfer' },
  referenceId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  status: { ...enumType(sequelize, PACKAGE_STATUSES), allowNull: false, defaultValue: 'Open' },

  packageType: { type: DataTypes.STRING(40), allowNull: true },
  weightKg: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
  packedBy: { type: unsignedInteger(sequelize), allowNull: true },
  packedAt: { type: DataTypes.DATE, allowNull: true },
  remarks: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'packing_slips',
  indexes: [{ fields: ['reference_type', 'reference_id'] }, { fields: ['branch_id'] }]
});
