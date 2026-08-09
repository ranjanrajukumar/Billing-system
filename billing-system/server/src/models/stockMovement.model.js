import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

const movementTypes = ['Purchase', 'Sale', 'Sale Return', 'Adjustment In', 'Adjustment Out', 'Opening Stock'];

export default (sequelize) => sequelize.define('StockMovement', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  movementType: { ...enumType(sequelize, movementTypes), allowNull: false },
  quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  referenceType: { type: DataTypes.STRING(40) },
  referenceId: { type: unsignedInteger(sequelize) },
  notes: { type: DataTypes.TEXT }
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
  tableName: 'stock_movements',
  indexes: [{ fields: ['movement_type'] }, { fields: ['reference_type', 'reference_id'] }]
});
