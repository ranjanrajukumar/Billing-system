import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

/** One pending sign-off, raised when a document trips an approval rule. */
export default (sequelize) => sequelize.define('ApprovalRequest', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  documentType: { type: DataTypes.STRING(40), allowNull: false },
  documentId: { type: unsignedInteger(sequelize), allowNull: false },
  documentNumber: { type: DataTypes.STRING(60), allowNull: true },
  ruleId: { type: unsignedInteger(sequelize), allowNull: true },
  branchId: { type: unsignedInteger(sequelize), allowNull: true },
  status: { ...enumType(sequelize, APPROVAL_STATUSES), allowNull: false, defaultValue: 'Pending' },

  // Kept as text so the request still reads correctly if the rule is later edited.
  reason: { type: DataTypes.STRING(255) },
  amount: { type: DataTypes.DECIMAL(16, 2), allowNull: true },
  approverRole: { type: DataTypes.STRING(60), allowNull: true },

  requestedBy: { type: unsignedInteger(sequelize), allowNull: true },
  decidedBy: { type: unsignedInteger(sequelize), allowNull: true },
  decidedAt: { type: DataTypes.DATE, allowNull: true },
  decisionNote: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'approval_requests',
  indexes: [
    { fields: ['document_type', 'document_id'] },
    { fields: ['status'] },
    { fields: ['approver_role'] }
  ]
});
