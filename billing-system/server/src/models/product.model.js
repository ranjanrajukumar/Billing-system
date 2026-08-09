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
  imagePath: { type: DataTypes.STRING(255) },
  imageData: { type: DataTypes.BLOB('long') },
  imageMimeType: { type: DataTypes.STRING(100) },
  // Where clients should fetch the image; falls back to the legacy disk path.
  imageUrl: {
    type: DataTypes.VIRTUAL,
    get() { return this.imageMimeType ? `/media/products/${this.id}` : (this.imagePath || null); }
  }
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
  // Image bytes are only ever needed by the media endpoint, so keep them out of every other query.
  defaultScope: { attributes: { exclude: ['imageData'] } },
  indexes: [{ fields: ['product_name'] }, { fields: ['barcode'] }, { fields: ['hsn_code'] }]
});
