import { Branch, UserLocation } from '../models/index.js';

/**
 * Who may work where.
 *
 * Three rules, in order:
 *
 *   1. An Admin may work anywhere, at Manage level. Locking an Admin out of a
 *      location would leave nobody able to grant access back.
 *   2. A user with rows in `user_locations` gets exactly those locations.
 *   3. A user with none falls back to their own `branchId` — which is how the
 *      application behaved before per-location rights existed, so nothing
 *      changes until somebody deliberately grants something.
 *
 * The fallback is the important one. Adding a permissions table that starts
 * empty and denies everything would lock every existing user out of their own
 * branch on the first deploy.
 */

const LEVEL_RANK = { View: 1, Operate: 2, Manage: 3 };

/** Whether `held` is at least as strong as `needed`. */
export function levelAllows(held, needed) {
  return (LEVEL_RANK[held] || 0) >= (LEVEL_RANK[needed] || 0);
}

/**
 * Every location this user may touch, with the level they hold at each.
 * Returns null for "everywhere" — an Admin — so callers can skip filtering
 * rather than loading the whole location list to compare against.
 */
export async function accessMap(user) {
  if (!user) return new Map();
  if (user.role === 'Admin') return null;

  const rows = await UserLocation.findAll({
    where: { userId: user.id, detstatus: false },
    attributes: ['branchId', 'accessLevel', 'isPrimary'],
    raw: true,
  });

  if (rows.length) {
    return new Map(rows.map((row) => [
      Number(row.branchId),
      { level: row.accessLevel, primary: Boolean(row.isPrimary) },
    ]));
  }

  // No explicit grants: their home branch, at the level they have always had.
  return user.branchId
    ? new Map([[Number(user.branchId), { level: 'Manage', primary: true }]])
    : new Map();
}

/** The ids this user may see. Null means every location. */
export async function allowedLocationIds(user) {
  const map = await accessMap(user);
  return map === null ? null : [...map.keys()];
}

/** The level this user holds at one location, or null if they hold none. */
export async function levelAt(user, branchId) {
  const map = await accessMap(user);
  if (map === null) return 'Manage';
  return map.get(Number(branchId))?.level || null;
}

/** Where this user lands when they sign in. */
export async function primaryLocationId(user) {
  const map = await accessMap(user);
  if (map === null) return user?.branchId || null;

  for (const [branchId, access] of map) {
    if (access.primary) return branchId;
  }
  // No explicit primary: their own branch if it is among the grants, else the
  // first one, so a user is never dropped somewhere they cannot work.
  const own = Number(user?.branchId);
  if (map.has(own)) return own;
  return map.size ? [...map.keys()][0] : null;
}

/** The locations this user may work at, named, for the switcher. */
export async function locationsFor(user) {
  const map = await accessMap(user);
  const where = { detstatus: false, isActive: true };
  if (map !== null) {
    if (!map.size) return [];
    where.id = [...map.keys()];
  }

  const rows = await Branch.findAll({
    where,
    attributes: ['id', 'branchName', 'branchCode', 'locationType', 'canSell', 'isDefault'],
    order: [['locationType', 'ASC'], ['branchName', 'ASC']],
  });

  return rows.map((row) => ({
    ...row.toJSON(),
    accessLevel: map === null ? 'Manage' : map.get(row.id)?.level || 'View',
    isPrimary: map === null ? row.isDefault : Boolean(map.get(row.id)?.primary),
  }));
}

/**
 * Replaces a user's location grants.
 *
 * Written as a whole set rather than one row at a time: the screen shows the
 * complete picture, and a partial save is how somebody ends up with access
 * they were told had been removed.
 */
export async function setUserLocations(userId, grants = [], actingUserId = null) {
  const wanted = grants
    .filter((grant) => grant.branchId)
    .map((grant) => ({
      branchId: Number(grant.branchId),
      accessLevel: ['View', 'Operate', 'Manage'].includes(grant.accessLevel)
        ? grant.accessLevel
        : 'Operate',
      isPrimary: Boolean(grant.isPrimary),
    }));

  // Exactly one primary, so sign-in always has somewhere to land.
  if (wanted.length && !wanted.some((g) => g.isPrimary)) wanted[0].isPrimary = true;
  let seenPrimary = false;
  for (const grant of wanted) {
    if (grant.isPrimary && seenPrimary) grant.isPrimary = false;
    if (grant.isPrimary) seenPrimary = true;
  }

  const existing = await UserLocation.findAll({ where: { userId } });
  const byBranch = new Map(existing.map((row) => [Number(row.branchId), row]));

  for (const grant of wanted) {
    const row = byBranch.get(grant.branchId);
    if (row) {
      await row.update({ ...grant, detstatus: false, authlstedit: actingUserId });
      byBranch.delete(grant.branchId);
    } else {
      await UserLocation.create({ userId, ...grant, authadd: actingUserId });
    }
  }

  // Anything left was removed on screen. Deleted outright rather than soft
  // deleted: a revoked permission that lingers in the table is the kind of
  // thing that quietly comes back.
  for (const row of byBranch.values()) await row.destroy();

  return wanted.length;
}
