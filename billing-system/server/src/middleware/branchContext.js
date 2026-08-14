import { Branch, Company } from '../models/index.js';

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

/**
 * Decides which location this request acts on.
 *
 * Two separate questions, which used to be conflated:
 *
 *   - *Which* location am I acting on? Answered by `X-Branch-Id` (or
 *     `?branchId=`) when the caller is entitled to target one. A warehouse is a
 *     location, so this has to work even for a business that has not turned on
 *     multi-branch scoping — otherwise receiving goods into a warehouse would
 *     silently put them in the shop.
 *
 *   - *What may I see*? Answered by `branchScope`, which multi-branch mode
 *     turns on. In single-location mode there is nothing to filter, so it stays
 *     null and every existing list behaves exactly as it did before.
 */
export async function resolveBranch(req, _res, next) {
  try {
    const { branchId: defaultBranchId, multiBranch } = await branchSettings();
    const isAdmin = req.user?.role === 'Admin';
    const requested = req.get('x-branch-id') || req.query.branchId;

    req.multiBranch = multiBranch;

    if (!multiBranch) {
      // An Admin may still name the location to act on — warehouses depend on
      // it — but nothing is filtered, so reads stay unchanged.
      const explicit = isAdmin && requested && String(requested).toLowerCase() !== 'all'
        ? Number(requested)
        : null;
      req.branchId = Number.isFinite(explicit) && explicit ? explicit : defaultBranchId;
      req.branchScope = null; // no filtering; there is only one selling location
      return next();
    }

    if (isAdmin) {
      // 'all' lets an Admin read across every branch.
      if (String(requested).toLowerCase() === 'all') {
        req.branchId = defaultBranchId;
        req.branchScope = null;
        return next();
      }
      req.branchId = requested ? Number(requested) : (req.user?.branchId || defaultBranchId);
      req.branchScope = req.branchId;
      return next();
    }

    // Everyone else is pinned to their assigned branch.
    req.branchId = req.user?.branchId || defaultBranchId;
    req.branchScope = req.branchId;
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Adds the branch filter to a `where` clause when scoping applies. */
export function scopedWhere(req, where = {}) {
  return req.branchScope ? { ...where, branchId: req.branchScope } : where;
}
