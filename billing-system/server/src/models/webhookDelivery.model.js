import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * One attempt to tell one endpoint about one event.
 *
 * This is a queue, not a log. A row is written *before* the HTTP call goes out
 * and updated after, which is what makes delivery survive a server that dies
 * mid-send: on restart the sweeper finds a PENDING row nobody finished and
 * tries again. Recording only after the fact would lose exactly the deliveries
 * a crash was most likely to interrupt.
 *
 * The payload is stored rather than rebuilt at send time. An event describes
 * something that already happened, and regenerating it on a retry an hour
 * later would send the state of the world now under the name of an event from
 * then — a customer's webhook receiving a "created" callback carrying values
 * that have since been edited.
 *
 * Retries back off, and `nextAttemptAt` is when the sweeper may next pick it
 * up. A receiver that is down does not benefit from being asked every second,
 * and hammering it is how an integration partner ends up blocking us.
 */
export const DELIVERY_STATUSES = ['PENDING', 'DELIVERED', 'FAILED', 'ABANDONED'];

/** Attempts before giving up, after which a person has to intervene. */
export const MAX_DELIVERY_ATTEMPTS = 6;

/** Minutes to wait before each attempt: seconds, then minutes, then an hour. */
export const RETRY_BACKOFF_MINUTES = [0, 1, 5, 15, 60, 180];

export default (sequelize) => sequelize.define('WebhookDelivery', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  endpointId: { type: unsignedInteger(sequelize), allowNull: false },

  eventType: { type: DataTypes.STRING(60), allowNull: false },
  // Stable id for the event itself, so a receiver that gets a duplicate after
  // a network fault can recognise it. The same guarantee we ask of our own
  // callers, offered outward.
  eventId: { type: DataTypes.STRING(64), allowNull: false },

  payload: { type: DataTypes.TEXT('long'), allowNull: false },

  status: { ...enumType(sequelize, DELIVERY_STATUSES), allowNull: false, defaultValue: 'PENDING' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextAttemptAt: { type: DataTypes.DATE, allowNull: true },

  responseStatus: { type: DataTypes.INTEGER, allowNull: true },
  // Truncated on the way in: a receiver that returns an HTML error page would
  // otherwise put a megabyte of markup in the queue for every failed call.
  responseBody: { type: DataTypes.STRING(2000), allowNull: true },
  lastError: { type: DataTypes.STRING(500), allowNull: true },

  deliveredAt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'webhook_deliveries',
  indexes: [
    // The sweeper's query: what is due to go out now.
    { fields: ['status', 'next_attempt_at'] },
    { fields: ['endpoint_id', 'addondt'] },
    { fields: ['event_id'] },
  ],
});
