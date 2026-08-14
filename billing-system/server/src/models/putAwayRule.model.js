import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * Where a product should be stored when it arrives.
 *
 * Put-away without rules means every receipt is a decision, and the decision
 * gets made by whoever is holding the trolley — which is how fast-moving stock
 * ends up at the back of the building and cold goods end up on a normal shelf.
 *
 * A rule matches on what the product *is* and names where it should go. The
 * first matching rule by priority wins; nothing matching is not an error, it
 * just means the picker chooses, exactly as before.
 */
export const MATCH_TYPES = ['StorageClass', 'Category', 'Brand', 'Product'];

export default (sequelize) => sequelize.define('PutAwayRule', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  // Null applies at every location; set it to confine a rule to one warehouse.
  branchId: { type: unsignedInteger(sequelize), allowNull: true },

  matchType: { ...enumType(sequelize, MATCH_TYPES), allowNull: false, defaultValue: 'StorageClass' },
  // What to match against, read according to matchType: a storage class name,
  // or a category / brand / product id.
  matchValue: { type: DataTypes.STRING(60), allowNull: false },

  // Where matching stock should go. A zone or rack sends it to that part of the
  // building and lets the picker choose a shelf within it; a bin is exact.
  targetBinId: { type: unsignedInteger(sequelize), allowNull: false },

  // Lower runs first, so a specific product rule can sit ahead of a broad
  // storage-class one.
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
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
  tableName: 'put_away_rules',
  indexes: [{ fields: ['branch_id'] }, { fields: ['match_type'] }, { fields: ['is_active'] }]
});
