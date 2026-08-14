import { Op } from 'sequelize';
import { Branch, Company } from '../models/index.js';
import { accessMap, levelAllows, primaryLocationId } from '../services/locationAccess.service.js';

let cached = { branchId: null, multiBranch: null, checkedAt: 0 };
const CACHE_MS = 30_000;

/** Default branch id and whether multi-branch mode is on, cached briefly. */
export async function branchSettings() {
  if (Date.now() - cached.checkedAt < CACHE_MS && cached.branchId) return cached;

  const [company, branch] = await Promise.all([
    Company.findOne(),
    Branch.findOne({ where: { isDefault: true, detstatus: false } })
      || Branch.findOne({ where: { detstatus: false } }),
  ]);

  cached = {
    branchId: branch?.id ?? null,
    multiBranch: Boolean(company?.multiBranchEnabled),
    checkedAt: Date.now(),
  };
  return cached;
}

export function clearBranchCache() {
  cached = { branchId: null, multiBranch: null, checkedAt: 0 };
}

/** Methods that change something and therefore need more than View. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Decides which location this request acts on, and whether the caller is
 * entitled to act on it.
 *
 * Three separate questions, kept separate on purpose:
 *
 *   - *Which* location am I acting on? `X-Branch-Id` (or `?branchId=`) when the
 *     caller may target one, otherwise their primary location. Writes land here.
 *
 *   - *May I?* Checked against the user's granted locations. Requesting one they
 *     hold nothing at is refused outright rather than silently redirected to
 *     somewhere they do have access — a silent redirect writes real documents to
 *     the wrong branch.
 *
 *   - *What may I see?* `visibleBranchIds` — every location they hold anything
 *     at — which is what list queries filter on. Distinct from the acting
 *     location, because an area manager reads three branches but bills at one.
 */
export async function resolveBranch(req, _res, next) {
  try {
    const { branchId: defaultBranchId, multiBranch } = await branchSettings();
    const isAdmin = req.user?.role === 'Admin';
    const requested = req.get('x-branch-id') || req.query.branchId;
    const wantsAll = String(requested).toLowerCase() === 'all';

    req.multiBranch = multiBranch;

    // Null means every location; a Map means exactly these.
    const access = await accessMap(req.user);
    req.locationAccess = access;
    req.visibleBranchIds = access === null ? null : [...access.keys()];

    const home = (await primaryLocationId(req.user)) || defaultBranchId;

    // A caller may name a location when they are an Admin, or when they hold
    // more than one — otherwise there is nothing to choose between.
    const mayTarget = isAdmin || (access !== null && access.size > 1);
    const target = mayTarget && requested && !wantsAll ? Number(requested) : null;

    if (target && access !== null && !access.has(target)) {
      return next(Object.assign(
        new Error('You do not have access to that location'),
        { status: 403 },
      ));
    }

    req.branchId = Number.isFinite(target) && target ? target : home;

    // Changing something needs more than the right to look at it.
    if (WRITE_METHODS.has(req.method) && access !== null) {
      const held = access.get(Number(req.branchId))?.level;
      if (held && !levelAllows(held, 'Operate')) {
        return next(Object.assign(
          new Error('You may only view this location, not change anything here'),
          { status: 403 },
        ));
      }
    }

    if (!multiBranch) {
      // One selling location: nothing to filter, exactly as before.
      req.branchScope = null;
      return next();
    }

    if (isAdmin && (wantsAll || !requested)) {
      // Admins read across everything unless they pick a location.
      req.branchScope = requested && !wantsAll ? req.branchId : null;
      return next();
    }

    // Reads are scoped to the acting location; `visibleBranchIds` widens lists
    // to every location this user may see.
    req.branchScope = req.branchId;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Adds the location filter to a `where` clause.
 *
 * Filters to every location the caller may see, not merely the one they are
 * acting on — an area manager over three branches should find all three in a
 * list. Falls back to the acting location when there is no explicit grant, and
 * to no filter at all in single-location mode.
 */
export function scopedWhere(req, where = {}) {
  const visible = req.visibleBranchIds;

  if (Array.isArray(visible) && visible.length > 1) {
    return { ...where, branchId: { [Op.in]: visible } };
  }
  return req.branchScope ? { ...where, branchId: req.branchScope } : where;
}
