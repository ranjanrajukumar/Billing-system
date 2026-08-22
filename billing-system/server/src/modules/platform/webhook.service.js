import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { WebhookEndpoint, WebhookDelivery } from '../../models/index.js';
import { MAX_DELIVERY_ATTEMPTS, RETRY_BACKOFF_MINUTES } from '../../models/webhookDelivery.model.js';

/**
 * Telling the outside world what happened here.
 *
 * Two properties matter more than anything else this file does.
 *
 * **Publishing never fails the thing that happened.** A webhook is a courtesy
 * to somebody else's system; an invoice must not fail to save because a partner
 * server is down. So `publish()` writes rows to a queue and returns, and every
 * path out of it swallows its own errors. If that trade is ever reversed, an
 * outage at a third party becomes an outage here.
 *
 * **Delivery survives a restart.** The row is written before the request goes
 * out, so a server killed mid-send leaves a PENDING row the sweeper retries.
 * Recording only on completion would lose precisely the deliveries a crash was
 * most likely to interrupt.
 */

/** Events an endpoint may subscribe to. A subscription to anything else is refused. */
export const WEBHOOK_EVENTS = [
  'stock.moved',
  'stock.low',
  'invoice.created',
  'invoice.paid',
  'purchase.received',
  'shipment.dispatched',
  'task.completed',
  'exception.raised',
  'sensor.breach',
  'rfid.read',
];

const parseEvents = (raw) => {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A malformed row must not take the dispatcher down with it — an endpoint
    // whose subscription cannot be read is treated as subscribed to nothing.
    return [];
  }
};

const newSecret = () => crypto.randomBytes(32).toString('hex');

/**
 * The signature a receiver checks.
 *
 * Timestamped and signed over `timestamp.body`, so a captured call cannot be
 * replayed later against a receiver that checks the age. HMAC-SHA256 because
 * the receiver already has the shared secret and needs no key distribution.
 */
export function sign(payload, secret, timestamp = Date.now()) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { timestamp, signature, header: `t=${timestamp},v1=${signature}` };
}

// ---- endpoints ----

export async function listEndpoints() {
  const rows = await WebhookEndpoint.findAll({
    where: { detstatus: false },
    order: [['addondt', 'DESC']],
  });
  // The secret never comes back out. It is shown once, at creation; an API that
  // returns it turns every read of the list into a way to forge our calls.
  return rows.map((row) => {
    const { secret, ...rest } = row.toJSON();
    return { ...rest, events: parseEvents(row.events), secretSet: Boolean(secret) };
  });
}

export async function createEndpoint({ label, url, events = [], userId = null }) {
  if (!label) throw Object.assign(new Error('An endpoint needs a label so a person can tell them apart'), { status: 400 });
  if (!/^https?:\/\//i.test(String(url || ''))) {
    throw Object.assign(new Error('The URL must start with http:// or https://'), { status: 400 });
  }
  const unknown = events.filter((event) => !WEBHOOK_EVENTS.includes(event));
  if (unknown.length) {
    throw Object.assign(
      new Error(`Unknown event(s): ${unknown.join(', ')}. Expected: ${WEBHOOK_EVENTS.join(', ')}`),
      { status: 400 },
    );
  }

  const secret = newSecret();
  const endpoint = await WebhookEndpoint.create({
    label, url, secret, events: JSON.stringify(events), authadd: userId,
  });

  // The one and only time the secret is returned.
  return { ...endpoint.toJSON(), secret, events, secretShownOnce: true };
}

export async function updateEndpoint(id, { userId = null, events, ...changes }) {
  const endpoint = await WebhookEndpoint.findOne({ where: { id, detstatus: false } });
  if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });

  if (events) {
    const unknown = events.filter((event) => !WEBHOOK_EVENTS.includes(event));
    if (unknown.length) {
      throw Object.assign(new Error(`Unknown event(s): ${unknown.join(', ')}`), { status: 400 });
    }
    changes.events = JSON.stringify(events);
  }
  // Never settable through this path — see createEndpoint.
  delete changes.secret;

  await endpoint.update({ ...changes, authlstedit: userId });
  const { secret, ...rest } = endpoint.toJSON();
  return { ...rest, events: parseEvents(endpoint.events) };
}

/** A fresh secret, when one has leaked. Returned once, exactly like creation. */
export async function rotateSecret(id, { userId = null } = {}) {
  const endpoint = await WebhookEndpoint.findOne({ where: { id, detstatus: false } });
  if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });
  const secret = newSecret();
  await endpoint.update({ secret, authlstedit: userId });
  return { id: endpoint.id, secret, secretShownOnce: true };
}

export async function removeEndpoint(id, { userId = null } = {}) {
  const endpoint = await WebhookEndpoint.findOne({ where: { id, detstatus: false } });
  if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });
  await endpoint.update({ detstatus: true, isActive: false, authdel: userId, delondt: new Date() });
  return { message: 'Endpoint removed' };
}

// ---- publishing ----

/**
 * Queue an event for everyone subscribed to it.
 *
 * Returns the number of deliveries queued, and throws nothing the caller has to
 * handle. Callers are domain code in the middle of saving something real.
 */
export async function publish(eventType, payload = {}) {
  try {
    if (!WEBHOOK_EVENTS.includes(eventType)) return 0;

    const endpoints = await WebhookEndpoint.findAll({ where: { isActive: true, detstatus: false } });
    const interested = endpoints.filter((endpoint) => parseEvents(endpoint.events).includes(eventType));
    if (!interested.length) return 0;

    // One id shared by every copy of this event, so a receiver getting the same
    // event twice — ours retried, or theirs double-processed — can tell.
    const eventId = crypto.randomUUID();
    const body = JSON.stringify({ eventId, eventType, occurredAt: new Date().toISOString(), data: payload });

    await WebhookDelivery.bulkCreate(interested.map((endpoint) => ({
      endpointId: endpoint.id,
      eventType,
      eventId,
      payload: body,
      status: 'PENDING',
      // Due immediately; the sweeper picks it up on its next pass.
      nextAttemptAt: new Date(),
    })));

    return interested.length;
  } catch (error) {
    // Swallowed on purpose. See the header: a webhook must never fail the
    // business event that produced it.
    console.warn(`Webhook publish for "${eventType}" failed: ${error.message}`);
    return 0;
  }
}

/** Send one queued delivery. Never throws; the outcome is recorded on the row. */
export async function attempt(delivery) {
  const endpoint = await WebhookEndpoint.findByPk(delivery.endpointId);
  if (!endpoint || endpoint.detstatus) {
    await delivery.update({ status: 'ABANDONED', lastError: 'The endpoint no longer exists' });
    return { ok: false, abandoned: true };
  }

  const attemptNo = delivery.attempts + 1;
  const { header } = sign(delivery.payload, endpoint.secret);

  try {
    const controller = new AbortController();
    // A receiver that accepts the connection and then never answers would
    // otherwise hold a sweeper slot open indefinitely.
    const timer = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': header,
        'x-webhook-event': delivery.eventType,
        'x-webhook-id': delivery.eventId,
        'x-webhook-attempt': String(attemptNo),
      },
      body: delivery.payload,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const text = (await response.text().catch(() => '')).slice(0, 2000);

    if (response.ok) {
      await delivery.update({
        status: 'DELIVERED', attempts: attemptNo, responseStatus: response.status,
        responseBody: text, deliveredAt: new Date(), nextAttemptAt: null, lastError: null,
      });
      await endpoint.update({ consecutiveFailures: 0, lastSuccessAt: new Date(), lastFailureReason: null });
      return { ok: true };
    }

    return failAttempt(delivery, endpoint, attemptNo, `HTTP ${response.status}`, response.status, text);
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'Timed out after 10s' : error.message;
    return failAttempt(delivery, endpoint, attemptNo, reason, null, null);
  }
}

async function failAttempt(delivery, endpoint, attemptNo, reason, responseStatus, responseBody) {
  const exhausted = attemptNo >= MAX_DELIVERY_ATTEMPTS;
  const waitMinutes = RETRY_BACKOFF_MINUTES[attemptNo] ?? RETRY_BACKOFF_MINUTES.at(-1);

  await delivery.update({
    status: exhausted ? 'ABANDONED' : 'FAILED',
    attempts: attemptNo,
    responseStatus,
    responseBody,
    lastError: reason,
    // Cleared when abandoned, so an exhausted row is never picked up again.
    nextAttemptAt: exhausted ? null : new Date(Date.now() + waitMinutes * 60_000),
  });

  const failures = (endpoint.consecutiveFailures || 0) + 1;
  await endpoint.update({
    consecutiveFailures: failures,
    lastFailureAt: new Date(),
    lastFailureReason: reason,
    // A receiver that has failed this many times running is switched off rather
    // than queued against forever. Someone has to look at it, and an endpoint
    // silently accumulating thousands of dead rows helps nobody.
    ...(failures >= 20 ? { isActive: false } : {}),
  });

  return { ok: false, retryInMinutes: exhausted ? null : waitMinutes };
}

/**
 * Send everything that is due. Called by the scheduler.
 *
 * FAILED rows are retried alongside PENDING ones — the status records the last
 * outcome, while `nextAttemptAt` decides eligibility. Only ABANDONED is final.
 */
export async function dispatchDue({ limit = 50 } = {}) {
  const due = await WebhookDelivery.findAll({
    where: {
      status: { [Op.in]: ['PENDING', 'FAILED'] },
      nextAttemptAt: { [Op.lte]: new Date() },
    },
    order: [['nextAttemptAt', 'ASC']],
    limit,
  });

  let delivered = 0;
  let failed = 0;
  for (const delivery of due) {
    const result = await attempt(delivery);
    if (result.ok) delivered += 1; else failed += 1;
  }
  return { considered: due.length, delivered, failed };
}

/** Fire a sample event at one endpoint, so a new integration can be proved. */
export async function test(id, { userId = null } = {}) {
  const endpoint = await WebhookEndpoint.findOne({ where: { id, detstatus: false } });
  if (!endpoint) throw Object.assign(new Error('Endpoint not found'), { status: 404 });

  const eventId = crypto.randomUUID();
  const delivery = await WebhookDelivery.create({
    endpointId: endpoint.id,
    eventType: 'stock.moved',
    eventId,
    payload: JSON.stringify({
      eventId,
      eventType: 'stock.moved',
      occurredAt: new Date().toISOString(),
      test: true,
      data: { message: 'Test delivery from the billing system', requestedBy: userId },
    }),
    status: 'PENDING',
    nextAttemptAt: new Date(),
  });

  // Sent inline rather than queued: somebody is watching the screen for the
  // answer, and "queued" tells them nothing about whether it works.
  const result = await attempt(delivery);
  await delivery.reload();
  return { ok: result.ok, delivery: delivery.toJSON() };
}

export async function deliveries({ endpointId = null, status = null, limit = 100 }) {
  const where = {};
  if (endpointId) where.endpointId = endpointId;
  if (status) where.status = status;
  return WebhookDelivery.findAll({
    where,
    include: [{ model: WebhookEndpoint, attributes: ['label', 'url'] }],
    order: [['addondt', 'DESC']],
    limit: Math.min(Number(limit) || 100, 1000),
  });
}
