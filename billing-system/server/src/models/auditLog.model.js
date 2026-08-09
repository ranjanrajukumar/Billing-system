import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

const actions = ['Create', 'Update', 'Delete', 'Login', 'LoginFailed', 'PasswordReset'];

export default (sequelize) => sequelize.define('AuditLog', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER },
  userName: { type: DataTypes.STRING(120) },
  action: { ...enumType(sequelize, actions), allowNull: false },
  entity: { type: DataTypes.STRING(60), allowNull: false },
  entityId: { type: DataTypes.STRING(40) },
  summary: { type: DataTypes.STRING(255) },
  // { field: { from, to } } for updates; the created/removed row for others.
  changes: { type: DataTypes.JSON },
  ipAddress: { type: DataTypes.STRING(60) },
  userAgent: { type: DataTypes.STRING(255) },
  method: { type: DataTypes.STRING(10) },
  path: { type: DataTypes.STRING(255) }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'audit_logs',
  indexes: [
    { fields: ['entity', 'entity_id'] },
    { fields: ['user_id'] },
    { fields: ['action'] },
    { fields: ['addondt'] }
  ]
});
