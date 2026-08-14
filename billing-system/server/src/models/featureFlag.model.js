import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * One row per optional module, letting a business switch a module off without
 * leaving Advanced mode. Absent rows mean "follow the business mode", so this
 * table only ever holds deliberate overrides.
 */
export default (sequelize) => sequelize.define('FeatureFlag', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  moduleKey: { type: DataTypes.STRING(60), allowNull: false, unique: true },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  notes: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'feature_flags',
  indexes: [{ fields: ['module_key'] }]
});
