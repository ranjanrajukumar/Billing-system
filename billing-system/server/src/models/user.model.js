import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('User', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  email: { type: DataTypes.STRING(160), allowNull: false, unique: true, validate: { isEmail: true } },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  mobile: { type: DataTypes.STRING(20) },
  resetToken: { type: DataTypes.STRING(255) },
  resetTokenExpiresAt: { type: DataTypes.DATE },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  // Branch this user works at. Admins are not restricted by it.
  // Must match Branch.id exactly (unsigned) or MySQL rejects the foreign key.
  branchId: { type: unsignedInteger(sequelize) },
  profileImagePath: { type: DataTypes.STRING(255) },
  profileImageData: { type: DataTypes.BLOB('long') },
  profileImageMimeType: { type: DataTypes.STRING(100) },
  profileImageUrl: {
    type: DataTypes.VIRTUAL,
    get() { return this.profileImageMimeType ? `/media/users/${this.id}` : (this.profileImagePath || null); }
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
  tableName: 'users',
  // Avatar bytes are only needed by the media endpoint, which uses .unscoped().
  defaultScope: { attributes: { exclude: ['profileImageData'] } },
  indexes: [{ fields: ['email'] }]
});
