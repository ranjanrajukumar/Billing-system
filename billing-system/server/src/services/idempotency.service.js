import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { IdempotencyKey } from '../models/index.js';

/**
 * Making a repeated request harmless.
 *
 * The contract a scanner can rely on:
 *
 *   - Send an operation once, it happens once.
 *   - Send it again with the same key, nothing new happens and the original
 *     answer comes back.
 *   - Send it again *while the first is still running*, and get told so —
 *     rather than being allowed to start a second copy.
 *   - Send a different operation under a key already used, and be refused.
 *
 * All four fall out of one thing: claim the key with an INSERT before doing any
 * work. Checking whether a key exists and then acting on the answer is a race
 * with a window between the two statements; the unique index has no window.
 */

/**
 * How long a claimed-but-unfinished key blocks a retry.
 *
 * A process killed mid-operation leaves a row saying "Processing" that nothing
 * will ever complete. Blocking that key forever would strand the device, so
 * after this long a retry is allowed to take the claim over. It is set well
 * beyond any real request so it can never pre-empt work still genuinely running.
 */
const STALE_CLAIM_MS = 5 * 60 * 1000;

/** How long finished keys are kept before sweeping. */
const RETENTION_DAYS = 30;

/** A stable digest of the request, so a retry can be told from a reused key. */
export function hashRequest(body) {
  const canonical = JSON.stringify(sortDeep(body ?? {}));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** Key order must not change the hash — clients do not promise field order. */
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = sortDeep(value[key]);
      return out;
    }, {});
  }
  return value;
}

const isUniqueViolation = (error) => error?.name === 'SequelizeUniqueConstraintError'
  || error?.original?.code === 'ER_DUP_ENTRY'
  || error?.original?.errno === 1062
  || error?.original?.number === 2627      // SQL Server unique constraint
  || error?.original?.number === 2601      // SQL Server unique index
  || /UNIQUE constraint failed/i.test(error?.original?.message || '');

/**
 * Claims a key for this request.
 *
 * Returns one of:
 *   { outcome: 'claimed', record }  — nobody has this key; do the work.
 *   { outcome: 'replay', record }   — already finished; return its stored reply.
 *   { outcome: 'inflight' }         — someone is doing it right now.
 *   { outcome: 'mismatch' }         — key reused for a different request.
 *   { outcome: 'retry', record }    — a previous attempt failed; try again.
 *
 * Deliberately outside any caller transaction. The claim must survive a rollback
 * of the work it guards — if the operation fails and takes the claim row with
 * it, a retry finds nothing and the record of the failure is lost.
 */
export async function claim({ key, operationType, deviceId = null, userId = null, body = null }) {
  const requestHash = hashRequest(body);

  try {
    const record = await IdempotencyKey.create({
      idempotencyKey: key,
      operationType,
      deviceId,
      userId,
      requestHash,
      requestBody: body ? JSON.stringify(body).slice(0, 60_000) : null,
      status: 'Processing',
      authadd: userId,
    });
    return { outcome: 'claimed', record };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  // Somebody got there first. What happens next depends on how far they got.
  const existing = await IdempotencyKey.findOne({ where: { idempotencyKey: key } });
  if (!existing) {
    // Vanishingly rare: the row was swept between the failed insert and this
    // read. Treating it as a fresh claim is correct — nothing has been done.
    return claim({ key, operationType, deviceId, userId, body });
  }

  if (existing.requestHash && existing.requestHash !== requestHash) {
    return { outcome: 'mismatch', record: existing };
  }
  if (existing.operationType !== operationType) {
    return { outcome: 'mismatch', record: existing };
  }

  if (existing.status === 'Completed') return { outcome: 'replay', record: existing };

  if (existing.status === 'Failed') {
    // A failure is not a result worth replaying — the device should be allowed
    // to try again. The claim is re-opened rather than a new row created, so
    // the history of attempts stays on one record.
    await existing.update({ status: 'Processing', failureReason: null, authlstedit: userId });
    return { outcome: 'retry', record: existing };
  }

  const age = Date.now() - new Date(existing.addondt || existing.createdAt || Date.now()).getTime();
  if (age > STALE_CLAIM_MS) {
    console.warn(
      `Idempotency key ${key} was left Processing for ${Math.round(age / 1000)}s — `
      + 'the original request probably died. Allowing a retry to take it over.',
    );
    await existing.update({ status: 'Processing', authlstedit: userId });
    return { outcome: 'retry', record: existing };
  }

  return { outcome: 'inflight', record: existing };
}

/** Records what the operation produced, so a retry can be answered from it. */
export async function complete(record, {
  responseStatus, responseBody, referenceType = null, referenceId = null,
}) {
  if (!record) return null;
  return record.update({
    status: 'Completed',
    responseStatus,
    responseBody: responseBody === undefined ? null : JSON.stringify(responseBody).slice(0, 60_000),
    referenceType,
    referenceId,
    completedAt: new Date(),
  });
}

/**
 * Records that it did not work.
 *
 * Marked Failed rather than deleted: the device is entitled to retry, and the
 * row is also the only evidence that the attempt was ever made — which is what
 * somebody needs when a picker swears they scanned something.
 */
export async function fail(record, reason) {
  if (!record) return null;
  return record.update({
    status: 'Failed',
    failureReason: String(reason || 'Unknown error').slice(0, 500),
    completedAt: new Date(),
  });
}

/** The stored reply, parsed back for replay. */
export function storedResponse(record) {
  if (!record?.responseBody) return null;
  try { return JSON.parse(record.responseBody); } catch { return null; }
}

/**
 * Removes keys older than the retention window.
 *
 * Only finished ones. A row still marked Processing is either live work or
 * evidence of a crash, and both are worth more than the space they take.
 */
export async function sweep({ days = RETENTION_DAYS } = {}) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const removed = await IdempotencyKey.destroy({
    where: {
      status: { [Op.in]: ['Completed', 'Failed'] },
      addondt: { [Op.lt]: cutoff },
    },
  });
  if (removed) console.log(`Swept ${removed} idempotency key(s) older than ${days} days.`);
  return removed;
}

/**
 * Runs an operation under a key, doing the claim/complete/fail dance.
 *
 * `work` receives the claim record so it can stamp what it created onto it.
 * Anything it throws marks the key Failed and is rethrown unchanged, so error
 * handling upstream is unaffected by idempotency being present.
 */
export async function withIdempotency({ key, operationType, deviceId, userId, body }, work) {
  if (!key) return { replayed: false, result: await work(null) };

  const claimed = await claim({ key, operationType, deviceId, userId, body });

  if (claimed.outcome === 'replay') {
    return { replayed: true, record: claimed.record, result: storedResponse(claimed.record) };
  }
  if (claimed.outcome === 'inflight') {
    throw Object.assign(
      new Error('This operation is already being processed — wait for it to finish rather than sending it again'),
      { status: 409, code: 'IDEMPOTENCY_IN_FLIGHT' },
    );
  }
  if (claimed.outcome === 'mismatch') {
    throw Object.assign(
      new Error('That idempotency key has already been used for a different operation'),
      { status: 422, code: 'IDEMPOTENCY_KEY_REUSED' },
    );
  }

  try {
    const result = await work(claimed.record);
    await complete(claimed.record, { responseStatus: 200, responseBody: result });
    return { replayed: false, record: claimed.record, result };
  } catch (error) {
    await fail(claimed.record, error.message);
    throw error;
  }
}
