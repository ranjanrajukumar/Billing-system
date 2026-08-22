import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('SalesReturnItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  // Which balance this line moves: 0 is the product's loose stock, a variant
  // id one packaged size. A pack returned or received against the loose pile
  // credits goods nobody has, and the two balances drift apart silently.
  variantId: { type: unsignedInteger(sequelize), allowNull: false, defaultValue: 0 },


  quantity: { type: DataTypes.FLOAT, allowNull: false },
  refundAmount: { type: DataTypes.FLOAT, allowNull: false },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'sales_return_items'
});
