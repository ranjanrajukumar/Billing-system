import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Product', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  productName: { type: DataTypes.STRING(180), allowNull: false },
  hsnCode: { type: DataTypes.STRING(20), allowNull: false },
  purchasePrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  sellingPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  gstPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  barcode: { type: DataTypes.STRING(80), unique: true },
  lowStockThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  imagePath: { type: DataTypes.STRING(255) }
,
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'products',
  indexes: [{ fields: ['product_name'] }, { fields: ['barcode'] }, { fields: ['hsn_code'] }]
});
