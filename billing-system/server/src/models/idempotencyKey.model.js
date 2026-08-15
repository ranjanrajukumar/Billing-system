import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * One record per attempted operation, so a scanner can send the same thing
 * twice without it happening twice.
 *
 * This exists because of how handhelds actually fail. A picker scans a bin, the
 * van drives out of Wi-Fi range, the request times out — and the device has no
 * way to know whether the server received it. Its only safe move is to send it
 * again when the signal returns. Without a key, that second send books a second
 * stock movement, and the warehouse quietly goes out of balance in a way no
 * stock-take can explain.
 *
 * The mechanism is the UNIQUE index on `idempotencyKey`, not the status column.
 * Reading first and then deciding is a race: two copies of the same request can
 * both read "not seen" before either writes. Inserting first makes the database
 * arbitrate — exactly one insert wins, the loser gets a constraint violation and
 * knows, with certainty, that somebody else is already doing the work.
 *
 * `requestHash` guards a different mistake: a device reusing a key for a
 * genuinely different request. Returning the first result would silently
 * discard the second operation, so a key that arrives with a different body is
 * refused rather than answered.
 */
export const IDEMPOTENCY_STATUSES = ['Processing', 'Completed', 'Failed'];

export default (sequelize) => sequelize.define('IdempotencyKey', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  // Supplied by the device, unique across the whole installation. A UUID from
  // the scanner is the expected form.
  idempotencyKey: { type: DataTypes.STRING(120), allowNull: false, unique: true },

  // Which handheld sent it. Kept because a device replaying keys after a factory
  // reset is a real failure mode, and it is unanswerable without this.
  deviceId: { type: DataTypes.STRING(120), allowNull: true },
  userId: { type: unsignedInteger(sequelize), allowNull: true },

  // What was being attempted — 'PUTAWAY', 'PICK', 'ADJUST'. Free text rather
  // than an enum so a new scanner operation does not need a migration.
  operationType: { type: DataTypes.STRING(60), allowNull: false },

  // A digest of the request body. Same key + same body is a retry; same key +
  // different body is a bug on the device, and must not be answered from cache.
  requestHash: { type: DataTypes.STRING(64), allowNull: true },
  // Kept for support: "what did the device actually send" is the first question
  // asked when a scan is disputed.
  requestBody: { type: DataTypes.TEXT, allowNull: true },

  // What the operation produced, so a retry can be pointed at the same record
  // rather than making a second one.
  referenceType: { type: DataTypes.STRING(40), allowNull: true },
  referenceId: { type: unsignedInteger(sequelize), allowNull: true },

  status: { ...enumType(sequelize, IDEMPOTENCY_STATUSES), allowNull: false, defaultValue: 'Processing' },

  // The reply the first attempt produced, replayed verbatim to a retry.
  responseStatus: { type: DataTypes.INTEGER, allowNull: true },
  responseBody: { type: DataTypes.TEXT, allowNull: true },
  failureReason: { type: DataTypes.STRING(500), allowNull: true },

  completedAt: { type: DataTypes.DATE, allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'idempotency_keys',
  indexes: [
    // The whole mechanism rests on this one. It is what makes two simultaneous
    // copies of a request resolve to one winner.
    { unique: true, name: 'idempotency_keys_key', fields: ['idempotency_key'] },
    { fields: ['device_id'] },
    { fields: ['operation_type', 'status'] },
    // Sweeping old keys, and finding a stuck Processing row.
    { fields: ['status', 'addondt'] }
  ]
});
