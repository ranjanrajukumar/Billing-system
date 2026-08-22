import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * One temperature/humidity sample from one gateway.
 *
 * Append-only. A reading is a statement about a moment that has passed, so
 * there is nothing to update and nothing to soft-delete: correcting history
 * here would destroy the only evidence that a chiller drifted. Cold-chain
 * questions are asked months later by someone who was not there.
 *
 * Both measures are nullable because gateways differ — a probe in a freezer
 * reports temperature and nothing else, and forcing it to invent a humidity of
 * zero would put a false reading in the record that later reads as a fault.
 *
 * `breached` is stored rather than derived. Thresholds change; what was in
 * range last month may be out of range under today's policy, and re-deriving
 * would silently rewrite the past. The flag records the judgement made at the
 * time the reading arrived, which is the one an auditor asks about.
 */
export const READING_SOURCES = ['DEVICE', 'MANUAL', 'IMPORT'];

export default (sequelize) => sequelize.define('SensorReading', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  deviceId: { type: unsignedInteger(sequelize), allowNull: true },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  // The place being measured. A gateway may cover several bins, so this is the
  // reading's own location rather than the device's.
  binId: { type: unsignedInteger(sequelize), allowNull: true },

  temperature: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
  humidity: { type: DataTypes.DECIMAL(6, 2), allowNull: true },

  // Celsius unless told otherwise. Recorded per reading because a site that
  // swaps a probe should not silently reinterpret everything measured before.
  temperatureUnit: { ...enumType(sequelize, ['C', 'F']), allowNull: false, defaultValue: 'C' },

  // When the sensor took it, which is not when we received it: a gateway that
  // buffers through an outage delivers an hour of readings at once, and
  // ordering them by arrival would make the outage invisible.
  recordedAt: { type: DataTypes.DATE, allowNull: false },

  source: { ...enumType(sequelize, READING_SOURCES), allowNull: false, defaultValue: 'DEVICE' },

  // The verdict at the time of arrival, and which threshold produced it.
  breached: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  thresholdId: { type: unsignedInteger(sequelize), allowNull: true },
  // Set when the breach raised a floor exception, so the two can be read
  // together without guessing which alert belongs to which sample.
  exceptionId: { type: unsignedInteger(sequelize), allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: false,
  tableName: 'sensor_readings',
  indexes: [
    // The chart: one place, over a period, in the order it was measured.
    { fields: ['bin_id', 'recorded_at'] },
    { fields: ['device_id', 'recorded_at'] },
    // The audit question: every excursion in this building, newest first.
    { fields: ['branch_id', 'breached', 'recorded_at'] },
  ],
});
