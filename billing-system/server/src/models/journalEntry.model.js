import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const JOURNAL_STATUSES = ['Draft', 'Posted', 'Reversed'];

/**
 * A double-entry journal voucher.
 *
 * Posted entries are never edited or deleted — a mistake is corrected by
 * posting a reversal that points back at the original, so the trail of what was
 * believed and when survives the correction.
 */
export default (sequelize) => sequelize.define('JournalEntry', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  entryNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  entryDate: { type: DataTypes.DATEONLY, allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: true },
  financialYearId: { type: unsignedInteger(sequelize), allowNull: true },
  status: { ...enumType(sequelize, JOURNAL_STATUSES), allowNull: false, defaultValue: 'Draft' },

  // 'Manual' for a hand-written voucher, otherwise the document that caused it.
  sourceType: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'Manual' },
  sourceId: { type: unsignedInteger(sequelize), allowNull: true },
  sourceNumber: { type: DataTypes.STRING(60), allowNull: true },

  totalDebit: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
  totalCredit: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },

  postedBy: { type: unsignedInteger(sequelize), allowNull: true },
  postedAt: { type: DataTypes.DATE, allowNull: true },
  // Links a reversal back to what it reverses, in both directions.
  reversedById: { type: unsignedInteger(sequelize), allowNull: true },
  reversalOfId: { type: unsignedInteger(sequelize), allowNull: true },
  narration: { type: DataTypes.TEXT },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'journal_entries',
  indexes: [
    { fields: ['entry_date'] },
    { fields: ['status'] },
    { fields: ['source_type', 'source_id'] },
    { fields: ['branch_id'] }
  ]
});
