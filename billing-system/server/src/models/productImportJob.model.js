import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('ProductImportJob', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Queued' },
  fileName: { type: DataTypes.STRING(255), allowNull: false },
  filePath: { type: DataTypes.STRING(500), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: true },
  requestedBy: { type: unsignedInteger(sequelize), allowNull: true },
  totalRows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  processedRows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  successCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  errorCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  errors: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  message: { type: DataTypes.STRING(500), allowNull: true },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'product_import_jobs',
  indexes: [{ fields: ['status'] }, { fields: ['requested_by'] }, { fields: ['addondt'] }],
});
