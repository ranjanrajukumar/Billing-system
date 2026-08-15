import { claim, complete, fail, storedResponse } from '../services/idempotency.service.js';

/**
 * Makes a route safe to call twice.
 *
 * Wraps the handler so a repeat of the same request returns the first reply
 * instead of doing the work again. The route itself is unchanged — it never
 * learns that idempotency is happening, which is what keeps the guarantee from
 * depending on every handler remembering to implement it.
 *
 * The key comes from the `Idempotency-Key` header. Without one the request is
 * passed straight through: existing callers, and the web UI where a human sees
 * the result and would not blindly retry, keep working exactly as before. It is
 * the scanner routes that are mounted with `required: true`.
 *
 * Only the reply is captured, never re-executed. A replay returns bytes from a
 * previous run; nothing in the handler is touched.
 */
export function idempotent(operationType, { required = false } = {}) {
  return async function idempotencyMiddleware(req, res, next) {
    const key = req.get('idempotency-key') || req.get('x-idempotency-key');

    if (!key) {
      if (!required) return next();
      return next(Object.assign(
        new Error('This operation needs an Idempotency-Key header so a retry cannot repeat it'),
        { status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' },
      ));
    }

    let claimed;
    try {
      claimed = await claim({
        key,
        operationType,
        deviceId: req.get('x-device-id') || null,
        userId: req.user?.id || null,
        body: req.body,
      });
    } catch (error) {
      return next(error);
    }

    if (claimed.outcome === 'replay') {
      // Flagged in the header rather than the body, so the device sees the same
      // payload it would have got the first time and needs no special parsing.
      res.set('Idempotency-Replayed', 'true');
      return res.status(claimed.record.responseStatus || 200).json(storedResponse(claimed.record));
    }

    if (claimed.outcome === 'inflight') {
      return next(Object.assign(
        new Error('This operation is already being processed — wait for it to finish rather than sending it again'),
        { status: 409, code: 'IDEMPOTENCY_IN_FLIGHT' },
      ));
    }

    if (claimed.outcome === 'mismatch') {
      return next(Object.assign(
        new Error('That idempotency key has already been used for a different request'),
        { status: 422, code: 'IDEMPOTENCY_KEY_REUSED' },
      ));
    }

    // The claim is ours. Capture whatever the handler replies with.
    req.idempotency = claimed.record;

    const originalJson = res.json.bind(res);
    let settled = false;

    res.json = (payload) => {
      if (!settled) {
        settled = true;
        const status = res.statusCode || 200;

        // Fire-and-forget: the client already has its answer, and failing to
        // record the outcome must not turn a successful operation into an error.
        // A key left Processing is recoverable — the stale-claim window lets a
        // retry take it over — whereas a rolled-back operation is not.
        const record = status >= 200 && status < 400
          ? complete(claimed.record, {
            responseStatus: status,
            responseBody: payload,
            referenceType: payload?.referenceType || null,
            referenceId: payload?.id || payload?.referenceId || null,
          })
          : fail(claimed.record, payload?.message || `HTTP ${status}`);

        record.catch((error) => {
          console.error(`Could not record idempotency key ${key}: ${error.message}`);
        });
      }
      return originalJson(payload);
    };

    // A handler that throws never reaches res.json, so the failure is recorded
    // here instead — otherwise the key would sit Processing and block the retry
    // it is meant to enable.
    res.on('finish', () => {
      if (settled) return;
      settled = true;
      fail(claimed.record, `Request ended with HTTP ${res.statusCode} and no body`)
        .catch(() => {});
    });

    return next();
  };
}
