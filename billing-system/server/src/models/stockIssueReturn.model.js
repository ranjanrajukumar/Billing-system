import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const RETURN_STATUSES = ['Draft', 'Posted', 'Cancelled'];

/**
 * Material Return Note (MRN) — issued material coming back to the store.
 *
 * Always against an issue, never free-standing. That is the whole reason this
 * document exists rather than a stock adjustment: an adjustment says the
 * quantity went up, and a return says *this* quantity, from *that* issue, came
 * back — which is what makes "what is still out with Maintenance" answerable at
 * all. A return with no issue behind it is a receipt, and the system already
 * has one of those in the SRV.
 */
export default (sequelize) => sequelize.define('StockIssueReturn', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  returnNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  returnDate: { type: DataTypes.DATEONLY, allowNull: false },
  // Carried on the return as well as being reachable through the issue, because
  // the return list is filtered by location like every other document list and
  // a join through the issue to do it would be the only one of its kind.
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  issueId: { type: unsignedInteger(sequelize), allowNull: false },
  status: { ...enumType(sequelize, RETURN_STATUSES), allowNull: false, defaultValue: 'Draft' },

  // Who handed it back, which is not always who it was issued to.
  returnedByUserId: { type: unsignedInteger(sequelize), allowNull: true },
  returnedByName: { type: DataTypes.STRING(160), allowNull: true },

  receivedBy: { type: unsignedInteger(sequelize), allowNull: true },
  postedAt: { type: DataTypes.DATE, allowNull: true },
  remarks: { type: DataTypes.TEXT },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'stock_issue_returns',
  indexes: [{ fields: ['issue_id'] }, { fields: ['branch_id'] }, { fields: ['status'] }]
});
