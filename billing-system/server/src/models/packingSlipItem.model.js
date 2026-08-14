import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/** What went into one package, and which lot it came from. */
export default (sequelize) => sequelize.define('PackingSlipItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  packageId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  serialNumber: { type: DataTypes.STRING(120), allowNull: true },
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'packing_slip_items',
  indexes: [{ fields: ['package_id'] }, { fields: ['product_id'] }]
});
