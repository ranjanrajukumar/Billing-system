import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * A piece of hardware that talks to this system on its own.
 *
 * Handhelds, RFID readers, sensor gateways and conveyor controllers are the
 * same problem wearing four costumes: something on the floor posts data without
 * a person watching, and the server has to know what it is, where it is, and
 * whether it is still alive. One table, because the alternative is four
 * near-identical ones that drift — and because "which devices have gone quiet"
 * is a question asked across all of them at once, not per kind.
 *
 * `deviceCode` is what the hardware sends in `X-Device-Id`. The idempotency
 * layer already records that header against every write, so a device row turns
 * an opaque string in a log into a named thing in a building.
 *
 * `lastSeenAt` is the whole reason this is a table and not a config file. A
 * scanner that stopped reporting looks exactly like a scanner with nothing to
 * report, and the difference matters at stocktake: silence from a freezer
 * gateway is not the same as a freezer that is fine.
 */
export const DEVICE_TYPES = ['HANDHELD', 'RFID_READER', 'SENSOR_GATEWAY', 'WCS_CONTROLLER'];

export const DEVICE_STATUSES = ['ACTIVE', 'INACTIVE', 'RETIRED'];

/** Nothing heard for this long and the device is treated as offline. */
export const DEVICE_OFFLINE_MINUTES = 15;

export default (sequelize) => sequelize.define('Device', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  // Uniqueness is declared in the indexes block, once, like the other models.
  deviceCode: { type: DataTypes.STRING(64), allowNull: false },
  deviceName: { type: DataTypes.STRING(120), allowNull: false },
  deviceType: { ...enumType(sequelize, DEVICE_TYPES), allowNull: false, defaultValue: 'HANDHELD' },

  // Where it lives. A reading or a scan means nothing without it: the same
  // temperature is unremarkable in a dry store and an emergency in a chiller.
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  // Optional, and only meaningful for fixed hardware — a gateway bolted to a
  // cold room, a reader over a dock door. A handheld moves, so it has none.
  binId: { type: unsignedInteger(sequelize), allowNull: true },

  status: { ...enumType(sequelize, DEVICE_STATUSES), allowNull: false, defaultValue: 'ACTIVE' },

  // Free-form, for the label on the side of the unit.
  model: { type: DataTypes.STRING(80), allowNull: true },
  serialNumber: { type: DataTypes.STRING(80), allowNull: true },
  firmwareVersion: { type: DataTypes.STRING(40), allowNull: true },

  // Updated on every authenticated call the device makes. Deliberately not an
  // audit column: it changes constantly and means something operational.
  lastSeenAt: { type: DataTypes.DATE, allowNull: true },
  lastIpAddress: { type: DataTypes.STRING(45), allowNull: true },

  notes: { type: DataTypes.STRING(500), allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'devices',
  indexes: [
    { unique: true, name: 'devices_code', fields: ['device_code'] },
    { fields: ['branch_id', 'device_type', 'status'] },
    // "What has gone quiet" — the health board's only query.
    { fields: ['status', 'last_seen_at'] },
  ],
});
