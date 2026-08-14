import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const PURCHASE_RETURN_STATUSES = ['Draft', 'Confirmed', 'Cancelled'];

/**
 * Goods sent back to a supplier. Confirming one takes the stock out and raises
 * a debit note against the supplier's account; the original purchase is never
 * altered, so what was bought and what was returned both stay on the record.
 */
export default (sequelize) => sequelize.define('PurchaseReturn', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  returnNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  returnDate: { type: DataTypes.DATEONLY, allowNull: false },
  purchaseId: { type: unsignedInteger(sequelize), allowNull: true },
  supplierId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  status: { ...enumType(sequelize, PURCHASE_RETURN_STATUSES), allowNull: false, defaultValue: 'Draft' },

  subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  taxAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  grandTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

  debitNoteNumber: { type: DataTypes.STRING(40), allowNull: true },
  reason: { type: DataTypes.STRING(255) },
  createdBy: { type: unsignedInteger(sequelize), allowNull: true },
  notes: { type: DataTypes.TEXT },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'purchase_returns',
  indexes: [{ fields: ['supplier_id'] }, { fields: ['purchase_id'] }, { fields: ['branch_id'] }, { fields: ['return_date'] }]
});
