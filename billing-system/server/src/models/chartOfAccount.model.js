import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

/**
 * The chart of accounts, as a tree.
 *
 * `normalBalance` is what makes the rest of the accounting work: an asset grows
 * on the debit side, a liability on the credit side, and every balance and
 * statement in the system is derived from that rather than from per-account
 * special cases. `isSystem` marks the accounts the posting service needs by
 * code, so they cannot be renamed out from under it or deleted.
 */
export default (sequelize) => sequelize.define('ChartOfAccount', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  accountType: { ...enumType(sequelize, ACCOUNT_TYPES), allowNull: false },
  normalBalance: { ...enumType(sequelize, ['Debit', 'Credit'], 10), allowNull: false },
  parentId: { type: unsignedInteger(sequelize), allowNull: true },
  // A group heading cannot be posted to; only leaves take entries.
  isGroup: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  openingBalance: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
  // Maintained by the posting service only — never written from a controller.
  currentBalance: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
  description: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'chart_of_accounts',
  indexes: [{ fields: ['code'] }, { fields: ['account_type'] }, { fields: ['parent_id'] }]
});
