import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * The range a place is supposed to stay inside.
 *
 * Kept apart from the bin because a limit is a policy with a lifetime, not a
 * property of a shelf: a chiller re-purposed for ambient stock needs its old
 * limits to stay readable against the readings they judged, or every historic
 * breach silently un-happens. Superseding a threshold means adding a row and
 * retiring the old one, never editing the numbers in place.
 *
 * Every bound is nullable and every combination is legal. A freezer cares only
 * that it never rises above a maximum; a curing room cares about both ends and
 * about humidity as well. A threshold with nothing set is inert rather than
 * invalid — that is the state a bin is in before anyone has decided.
 *
 * `graceMinutes` is what stops the alerting being useless. A door held open
 * during a load spikes the temperature for ninety seconds, and a system that
 * shouts about it teaches the floor to ignore it. A breach has to persist to
 * count.
 */
export default (sequelize) => sequelize.define('SensorThreshold', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  // The bin this governs. Null means the branch-wide default, used for any bin
  // without one of its own — so a site can set one policy and refine later.
  binId: { type: unsignedInteger(sequelize), allowNull: true },

  label: { type: DataTypes.STRING(120), allowNull: true },

  minTemperature: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
  maxTemperature: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
  minHumidity: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
  maxHumidity: { type: DataTypes.DECIMAL(6, 2), allowNull: true },

  // How long a reading may sit outside the range before it is a breach.
  graceMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },

  // Off keeps the policy on record without it judging anything — the honest
  // way to stand a rule down, as against deleting it and losing why it existed.
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'sensor_thresholds',
  indexes: [
    // Resolving the rule for an arriving reading: the bin's own, else the
    // branch default. Both come off this one index.
    { fields: ['branch_id', 'bin_id', 'is_active', 'detstatus'] },
  ],
});
