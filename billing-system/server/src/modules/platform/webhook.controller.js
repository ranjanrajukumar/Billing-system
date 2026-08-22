import { asyncHandler } from '../../utils/asyncHandler.js';
import * as webhooks from './webhook.service.js';

/**
 * The API over outbound integrations.
 *
 * The secret is the one thing here that needs care. It is returned by exactly
 * two endpoints — creation and rotation — and by nothing else, ever. An API
 * that hands it back on a list read turns every reader of that list into
 * somebody who can forge our calls, and "read the settings screen" is a much
 * weaker permission than "impersonate this system".
 */

const deliveryDto = (delivery) => ({
  id: delivery.id,
  endpointId: delivery.endpointId,
  endpointLabel: delivery.WebhookEndpoint?.label || null,
  eventType: delivery.eventType,
  eventId: delivery.eventId,
  status: delivery.status,
  attempts: delivery.attempts,
  responseStatus: delivery.responseStatus,
  lastError: delivery.lastError,
  nextAttemptAt: delivery.nextAttemptAt,
  deliveredAt: delivery.deliveredAt,
  createdAt: delivery.addondt,
});

export const listEndpoints = asyncHandler(async (_req, res) => {
  res.json(await webhooks.listEndpoints());
});

export const createEndpoint = asyncHandler(async (req, res) => {
  const created = await webhooks.createEndpoint({
    label: req.body.label,
    url: req.body.url,
    events: Array.isArray(req.body.events) ? req.body.events : [],
    userId: req.user?.id,
  });
  res.status(201).json(created);
});

export const updateEndpoint = asyncHandler(async (req, res) => {
  res.json(await webhooks.updateEndpoint(req.params.id, { ...req.body, userId: req.user?.id }));
});

export const rotateSecret = asyncHandler(async (req, res) => {
  res.json(await webhooks.rotateSecret(req.params.id, { userId: req.user?.id }));
});

export const removeEndpoint = asyncHandler(async (req, res) => {
  res.json(await webhooks.removeEndpoint(req.params.id, { userId: req.user?.id }));
});

export const testEndpoint = asyncHandler(async (req, res) => {
  const result = await webhooks.test(req.params.id, { userId: req.user?.id });
  // 200 whether or not the far end accepted it: the call itself succeeded, and
  // the body says what the receiver did. A 502 here would read as our fault.
  res.json(result);
});

export const listDeliveries = asyncHandler(async (req, res) => {
  const rows = await webhooks.deliveries({
    endpointId: req.query.endpointId || null,
    status: req.query.status || null,
    limit: req.query.limit,
  });
  res.json(rows.map(deliveryDto));
});

export const vocabulary = asyncHandler(async (_req, res) => {
  res.json({ events: webhooks.WEBHOOK_EVENTS });
});

/** Send what is due now, for an operator who does not want to wait for the sweep. */
export const dispatchNow = asyncHandler(async (_req, res) => {
  res.json(await webhooks.dispatchDue({ limit: 100 }));
});
