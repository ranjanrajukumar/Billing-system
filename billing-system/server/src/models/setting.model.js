import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Setting', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  value: { type: DataTypes.TEXT, allowNull: false },
  type: { ...enumType(sequelize, ['string', 'number', 'boolean', 'json']), defaultValue: 'string' }
,
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt', tableName: 'settings' });
