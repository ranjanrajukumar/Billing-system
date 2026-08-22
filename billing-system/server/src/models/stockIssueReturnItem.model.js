import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * What came back, and in what state.
 *
 * `Good` goes back on the shelf. `Damaged` does not — it closes the outstanding
 * quantity and stops there. Recording both on the same document is the point:
 * a fitter handing back four good bearings and one crushed one is one event,
 * and splitting it into a return and a separate write-off loses the only thing
 * that connects them.
 */
export const RETURN_CONDITIONS = ['Good', 'Damaged'];

export default (sequelize) => sequelize.define('StockIssueReturnItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  returnId: { type: unsignedInteger(sequelize), allowNull: false },
  // Which line of the issue this is coming back against. Not just the product:
  // the same product can appear twice on one voucher, drawn from two lots, and
  // the outstanding figure belongs to the line rather than to the product.
  issueItemId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },

  quantity: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
  condition: { ...enumType(sequelize, RETURN_CONDITIONS), allowNull: false, defaultValue: 'Good' },

  batchId: { type: unsignedInteger(sequelize), allowNull: true },
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
  tableName: 'stock_issue_return_items',
  indexes: [{ fields: ['return_id'] }, { fields: ['issue_item_id'] }, { fields: ['product_id'] }]
});
