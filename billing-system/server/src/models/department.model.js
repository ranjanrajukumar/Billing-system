import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * A department or cost centre that material can be issued to.
 *
 * Master data rather than a free-text box on the issue voucher, because the
 * question the whole document exists to answer — "what did Maintenance consume
 * last quarter" — cannot be answered across four spellings of "Maintenance".
 * The free-text recipient is still there on the voucher for the cases a list
 * cannot cover; this is for the ones it can.
 */
export default (sequelize) => sequelize.define('Department', {
  // Declared rather than left to Sequelize's default.
  //
  // The other master tables let it default, which produces a signed INTEGER.
  // That is fine while nothing points at them, and this one is pointed at:
  // `stock_issues.department_id` is UNSIGNED like every other foreign key in
  // the transactional models, and MySQL refuses a constraint between the two
  // widths. It only surfaces on a database built from nothing — an install that
  // already has the tables never re-creates the key — so the failure lands on a
  // new deployment rather than on whoever wrote it.
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  code: { type: DataTypes.STRING(20) },
  description: { type: DataTypes.STRING },
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'departments'
});
