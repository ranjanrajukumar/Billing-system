import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * One product on a store issue voucher.
 *
 * `returnedQty` and `scrappedQty` are kept on the line rather than derived from
 * the return documents, and that is a deliberate exception to the rule that
 * statements are derived: this pair is not a statement but a *balance under
 * contention*. Two people returning against the same line at the same moment
 * have to resolve to one outstanding figure, and the only thing that can
 * arbitrate that is a row somebody holds a lock on. Both are written inside the
 * same transaction as the return that moved them, so they cannot drift from the
 * documents — and stockIssue.service asserts exactly that.
 */
export default (sequelize) => sequelize.define('StockIssueItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  issueId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },

  quantity: { type: DataTypes.DECIMAL(14, 4), allowNull: false },

  /** Came back fit to use and went back on the shelf. */
  returnedQty: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  /**
   * Came back unusable, or was written off where it stood.
   *
   * It closes the outstanding quantity without adding anything to stock,
   * because it is not stock any more. The goods already left at issue; scrap is
   * the record of why they are never coming back, not a second movement.
   */
  scrappedQty: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  /**
   * Written off by closing the voucher: used up, and nobody is filing paperwork
   * about it.
   *
   * A separate column from `scrappedQty` because they are separate facts, not
   * shades of one. Scrap is a physical event somebody witnessed and signed a
   * return note for; this is an administrative decision that the rest is not
   * coming back. The books tell them apart too — consumed material stays an
   * expense, while damaged goods returned move to write-off — and so does the
   * reconciliation, which can only check the figures that have documents behind
   * them.
   */
  closedQty: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },

  // Which lot it came out of, so a return can be put back where it came from
  // rather than into whichever lot happens to be open.
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  batchNumber: { type: DataTypes.STRING(120), allowNull: true },

  // What the goods were worth on the way out, so the expense side of the
  // journal entry is not guessed from today's price.
  unitCost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  remarks: { type: DataTypes.STRING(255), allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'stock_issue_items',
  indexes: [{ fields: ['issue_id'] }, { fields: ['product_id'] }]
});
