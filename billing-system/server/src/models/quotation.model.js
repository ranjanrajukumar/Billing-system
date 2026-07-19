import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Quotation', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  quotationNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  quotationDate: { type: DataTypes.DATEONLY, allowNull: false },
  validUntil: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.ENUM('Draft', 'Sent', 'Accepted', 'Rejected'), defaultValue: 'Draft' },
  totalAmount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  notes: { type: DataTypes.TEXT },
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'quotations'
});
