import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * Which locations a user may work at, and what they may do there.
 *
 * A single `users.branchId` says where somebody is based; it cannot say that a
 * warehouse manager covers two godowns but not the shop, or that an area
 * manager can see three branches and approve at only one. This table is that
 * second answer.
 *
 * Deliberately additive: a user with no rows here falls back to their
 * `branchId` and behaves exactly as before. Rights only ever appear when
 * somebody has actually granted them, so an existing installation is unchanged
 * until it chooses otherwise.
 */
export const ACCESS_LEVELS = ['View', 'Operate', 'Manage'];

/** What each level lets someone do, for the UI and for the API's own checks. */
export const ACCESS_MEANING = {
  View: 'See this location\'s stock and documents, but change nothing',
  Operate: 'Bill, receive, transfer and count here',
  Manage: 'Everything, including approving and writing stock off',
};

export default (sequelize) => sequelize.define('UserLocation', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  userId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  accessLevel: { ...enumType(sequelize, ACCESS_LEVELS), allowNull: false, defaultValue: 'Operate' },
  // The location this user lands on when they sign in. Exactly one per user.
  isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'user_locations',
  indexes: [
    { unique: true, fields: ['user_id', 'branch_id'] },
    { fields: ['user_id'] },
    { fields: ['branch_id'] }
  ]
});
