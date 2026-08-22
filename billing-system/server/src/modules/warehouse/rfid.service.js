import { Op } from 'sequelize';
import { RfidTag, Product, ProductBatch, StockOwner, WarehouseBin, Device } from '../../models/index.js';
import { TAG_STATUSES } from '../../models/rfidTag.model.js';
import * as exceptions from './warehouseException.service.js';
import { touch } from './device.service.js';

/**
 * RFID tags, and what a sweep of a bin says about what is in it.
 *
 * The governing rule, stated once and obeyed everywhere below: **a read does
 * not move stock.** A reader sweeping a bay picks up tags through racking, off
 * a passing forklift, and from the next aisle; treating each stray read as a
 * putaway would let the ledger be rewritten by radio noise. What a read
 * produces is *evidence*, and evidence that disagrees with the ledger produces
 * an exception for a person to settle.
 *
 * This is why reconciliation returns findings rather than performing
 * corrections. The stock-count and adjustment screens already exist to move
 * stock deliberately, with an audit trail; a second, silent path that did it
 * from a radio sweep would be indistinguishable from data loss.
 */

const clean = (value) => String(value ?? '').trim();

// ---- the tag register ----

export async function registerTag({
  epc, productId = null, variantId = null, batchId = null, ownerId = null,
  quantity = 1, branchId = null, userId = null,
}) {
  const code = clean(epc);
  if (!code) throw Object.assign(new Error('A tag needs its EPC'), { status: 400 });
  if (Number(quantity) <= 0) throw Object.assign(new Error('A tag must represent more than zero'), { status: 400 });

  // Re-encoding a tag is normal — a label comes off a shipped pallet and goes
  // onto a new one. Reusing the row keeps the EPC unique and the history
  // attached, which a delete-and-recreate would throw away.
  const existing = await RfidTag.findOne({ where: { epc: code } });
  const values = {
    productId, variantId, batchId, ownerId, quantity, branchId,
    status: productId ? 'ASSIGNED' : 'UNASSIGNED',
    detstatus: false,
  };

  if (existing) {
    await existing.update({ ...values, authlstedit: userId });
    return existing;
  }
  return RfidTag.create({ epc: code, ...values, authadd: userId });
}

export async function registerMany(tags = [], { userId = null } = {}) {
  if (!Array.isArray(tags) || !tags.length) {
    throw Object.assign(new Error('There are no tags to register'), { status: 400 });
  }
  const results = [];
  for (const tag of tags) {
    try {
      const saved = await registerTag({ ...tag, userId });
      results.push({ ok: true, epc: saved.epc, id: saved.id });
    } catch (error) {
      results.push({ ok: false, epc: tag?.epc || null, status: error.status || 500, error: error.message });
    }
  }
  return {
    total: results.length,
    registered: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function listTags({ branchId = null, status = null, productId = null, binId = null, search = null, limit = 500 }) {
  const where = { detstatus: false };
  if (branchId) where.branchId = branchId;
  if (status) where.status = status;
  if (productId) where.productId = productId;
  if (binId) where.lastSeenBinId = binId;
  if (search) where.epc = { [Op.like]: `%${clean(search)}%` };

  return RfidTag.findAll({
    where,
    include: [
      { model: Product, attributes: ['productName', 'primaryUnit'] },
      { model: ProductBatch, attributes: ['batchNumber', 'expiryDate'] },
      { model: StockOwner, attributes: ['ownerName'] },
      { model: WarehouseBin, as: 'lastSeenBin', attributes: ['code', 'name'] },
    ],
    order: [['lastSeenAt', 'DESC']],
    limit: Math.min(Number(limit) || 500, 5000),
  });
}

export async function retireTag(id, { userId = null } = {}) {
  const tag = await RfidTag.findOne({ where: { id, detstatus: false } });
  if (!tag) throw Object.assign(new Error('Tag not found'), { status: 404 });
  await tag.update({ status: 'RETIRED', detstatus: true, authdel: userId, delondt: new Date() });
  return { message: 'Tag retired' };
}

/**
 * A bulk read: a reader saw these EPCs at this place.
 *
 * Records where each known tag was last seen, and reports the unknown ones.
 * Unknown EPCs are *not* auto-created — a tag nobody registered is either
 * another company's stock passing the dock or a label from a system we do not
 * run, and inventing rows for them would fill the register with things that
 * are not ours.
 */
export async function recordRead({ epcs = [], binId = null, branchId, deviceCode = null, deviceId = null, userId = null }) {
  if (!Array.isArray(epcs) || !epcs.length) {
    throw Object.assign(new Error('A read needs at least one tag'), { status: 400 });
  }
  if (!branchId) throw Object.assign(new Error('A read must say which location it happened at'), { status: 400 });

  let device = null;
  if (deviceCode) device = await touch(deviceCode);
  const resolvedDeviceId = deviceId || device?.id || null;

  const codes = [...new Set(epcs.map(clean).filter(Boolean))];
  const known = await RfidTag.findAll({ where: { epc: codes, detstatus: false } });
  const knownByEpc = new Map(known.map((tag) => [tag.epc, tag]));

  const seenAt = new Date();
  const moved = [];
  for (const tag of known) {
    // Where it was before this sweep — worth reporting, because a tag that has
    // jumped bins is either a real move nobody recorded or a stray read.
    const previousBinId = tag.lastSeenBinId;
    await tag.update({
      lastSeenBinId: binId ?? tag.lastSeenBinId,
      lastSeenAt: seenAt,
      lastSeenDeviceId: resolvedDeviceId,
    });
    if (binId && previousBinId && Number(previousBinId) !== Number(binId)) {
      moved.push({ epc: tag.epc, fromBinId: previousBinId, toBinId: binId, productId: tag.productId });
    }
  }

  const unknown = codes.filter((code) => !knownByEpc.has(code));

  return {
    binId,
    readAt: seenAt,
    total: codes.length,
    recognised: known.length,
    unknown,
    // Reported, not acted on. See the note at the top of this file.
    relocated: moved,
  };
}

/**
 * Compare what a sweep saw against what the register says should be there.
 *
 * Three findings, and they are not the same problem:
 *
 *   - **missing**  — the register puts the tag in this bin; the sweep did not
 *     see it. Either it has gone, or it is buried where the antenna cannot
 *     reach. Worth a look, not an alarm.
 *   - **unexpected** — seen here, but the register says it lives elsewhere.
 *     This is the one that usually means a real, unrecorded move.
 *   - **unknown** — seen here and not in the register at all.
 *
 * Raising an exception is optional and off by default, because a first sweep of
 * a bay that has never been tagged would otherwise raise hundreds at once and
 * bury the queue that the rest of the floor depends on.
 */
export async function reconcileBin({ binId, epcs = [], branchId, raiseExceptions = false, deviceCode = null, userId = null }) {
  if (!binId) throw Object.assign(new Error('Reconciliation needs a bin'), { status: 400 });

  const read = await recordRead({ epcs, binId, branchId, deviceCode, userId });
  const seen = new Set(epcs.map(clean).filter(Boolean));

  // Everything the register believed was here *before* this sweep updated it.
  // Read after recordRead, so tags seen in this sweep already point here; the
  // ones still pointing here but unseen are the genuinely missing.
  const here = await RfidTag.findAll({
    where: { lastSeenBinId: binId, detstatus: false, status: { [Op.ne]: 'RETIRED' } },
    include: [{ model: Product, attributes: ['productName'] }],
  });

  const missing = here
    .filter((tag) => !seen.has(tag.epc))
    .map((tag) => ({ epc: tag.epc, productId: tag.productId, productName: tag.Product?.productName || null, quantity: Number(tag.quantity) }));

  const unexpected = read.relocated.map((row) => ({ ...row, reason: 'Register had it in another bin' }));

  const findings = { binId, seen: read.total, missing, unexpected, unknown: read.unknown };

  if (raiseExceptions && (missing.length || unexpected.length)) {
    const bin = await WarehouseBin.findByPk(binId);
    findings.exception = await exceptions.raise({
      exceptionType: missing.length ? 'STOCK_MISMATCH' : 'WRONG_BIN',
      branchId,
      binId,
      referenceType: 'RFID_RECONCILE',
      description: `RFID sweep of ${bin?.code || binId}: ${missing.length} tag(s) not found, `
        + `${unexpected.length} found that the register placed elsewhere, ${read.unknown.length} unrecognised`,
      userId,
    });
  }

  return findings;
}

/** Counts for the tag screen's header. */
export async function summary(branchId = null) {
  const where = { detstatus: false };
  if (branchId) where.branchId = branchId;

  const tags = await RfidTag.findAll({ where, attributes: ['status', 'lastSeenAt'] });
  const byStatus = Object.fromEntries(TAG_STATUSES.map((s) => [s, 0]));
  for (const tag of tags) byStatus[tag.status] = (byStatus[tag.status] || 0) + 1;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return {
    total: tags.length,
    byStatus,
    seenToday: tags.filter((tag) => tag.lastSeenAt && new Date(tag.lastSeenAt) > dayAgo).length,
    // Assigned but never read: printed and applied, or applied and never swept.
    neverSeen: tags.filter((tag) => !tag.lastSeenAt).length,
  };
}

export const VOCABULARY = { statuses: TAG_STATUSES };
