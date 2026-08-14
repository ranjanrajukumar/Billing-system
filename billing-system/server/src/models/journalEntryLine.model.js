import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * One side of a journal entry. This table *is* the general ledger: a GL for an
 * account is these lines filtered and ordered by date, and a trial balance is
 * them summed by account. Keeping one table avoids a second copy of the truth
 * that could disagree with the first.
 */
export default (sequelize) => sequelize.define('JournalEntryLine', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  entryId: { type: unsignedInteger(sequelize), allowNull: false },
  accountId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: true },

  debit: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
  credit: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },

  // Optional sub-ledger link, so a receivable line knows whose it is.
  partyType: { type: DataTypes.STRING(20), allowNull: true },
  partyId: { type: unsignedInteger(sequelize), allowNull: true },
  narration: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'journal_entry_lines',
  indexes: [
    { fields: ['entry_id'] },
    { fields: ['account_id'] },
    { fields: ['party_type', 'party_id'] }
  ]
});
