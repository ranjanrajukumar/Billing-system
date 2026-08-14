import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * Zone / rack / shelf inside a warehouse, as a self-referencing tree so a small
 * business can stop at "Zone A" while a large one goes down to a bin.
 *
 * Deliberately optional: stock is held at the location, and a bin only says
 * where in the building to look for it. Nothing in the stock engine requires one.
 */
export const BIN_LEVELS = ['Zone', 'Rack', 'Shelf', 'Bin'];

export default (sequelize) => sequelize.define('WarehouseBin', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  parentId: { type: unsignedInteger(sequelize), allowNull: true },
  level: { ...enumType(sequelize, BIN_LEVELS), allowNull: false, defaultValue: 'Zone' },
  code: { type: DataTypes.STRING(40), allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: true },
  capacity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'warehouse_bins',
  indexes: [{ fields: ['branch_id'] }, { fields: ['parent_id'] }]
});
