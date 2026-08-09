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
 * Decides which branch this request acts on.
 *
 * Single-branch mode: always the default branch, so behaviour is unchanged.
 * Multi-branch mode: the user's own branch. Admins may target another branch
 * with `X-Branch-Id` (or `?branchId=`), and may read across all branches.
 */
export async function resolveBranch(req, _res, next) {
  try {
    const { branchId: defaultBranchId, multiBranch } = await branchSettings();
    const isAdmin = req.user?.role === 'Admin';
    const requested = req.get('x-branch-id') || req.query.branchId;

    req.multiBranch = multiBranch;

    if (!multiBranch) {
      req.branchId = defaultBranchId;
      req.branchScope = null; // no filtering; there is only one branch
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
