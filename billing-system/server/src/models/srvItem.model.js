import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('SrvItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  srvId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  
  // The quantity entered by the user
  quantity: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
  
  // Batch details if applicable
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  batchNumber: { type: DataTypes.STRING(120), allowNull: true },
  expiryDate: { type: DataTypes.DATEONLY, allowNull: true },

  // Cost at time of receipt for stock valuation
  unitCost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'srv_items',
  indexes: [{ fields: ['srv_id'] }, { fields: ['product_id'] }]
});
