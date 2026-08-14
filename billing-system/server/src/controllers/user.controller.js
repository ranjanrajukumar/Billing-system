import bcrypt from 'bcrypt';
import { Branch, Role, User, UserLocation } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { ALL_MENU_KEYS, ALWAYS_VISIBLE, catalogueForModules, visibleMenus } from '../config/menu.js';
import { getConfig } from '../services/config.service.js';
import { ACCESS_LEVELS, ACCESS_MEANING } from '../models/userLocation.model.js';
import { primaryLocationId, setUserLocations } from '../services/locationAccess.service.js';

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, mobile: user.mobile, isActive: user.isActive, role: user.Role?.name, roleId: user.roleId, branchId: user.branchId, branchName: user.Branch?.branchName, profileImagePath: user.profileImagePath, profileImageUrl: user.profileImageUrl });

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await User.findAndCountAll({
    where: { detstatus: false },
    include: [Role, Branch],
    limit, offset, order: [['addondt', 'DESC']],
  });
  res.json(paged(rows.map(publicUser), count, page, limit));
});

export const listRoles = asyncHandler(async (_req, res) => {
  res.json(await Role.findAll({ where: { detstatus: false }, order: [['name', 'ASC']] }));
});

/** The menu tree plus each role's current rights, for the rights screen. */
export const menuRights = asyncHandler(async (_req, res) => {
  const [roles, { modules }] = await Promise.all([
    Role.findAll({ where: { detstatus: false }, order: [['name', 'ASC']] }),
    getConfig(),
  ]);

  // Only pages this company actually has are worth granting rights to.
  res.json({
    catalogue: catalogueForModules(modules),
    alwaysVisible: ALWAYS_VISIBLE,
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      isAdmin: role.name === 'Admin',
      menus: visibleMenus(role, modules),
    })),
  });
});

/**
 * Which locations a user may work at, and at what level.
 *
 * Returns every location alongside the grant, so the screen shows the whole
 * picture rather than only what has already been granted — otherwise adding a
 * location means knowing it exists before you can find it.
 */
export const userLocations = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const [locations, grants] = await Promise.all([
    Branch.findAll({
      where: { detstatus: false },
      attributes: ['id', 'branchName', 'branchCode', 'locationType', 'isActive'],
      order: [['locationType', 'ASC'], ['branchName', 'ASC']],
    }),
    UserLocation.findAll({ where: { userId: user.id, detstatus: false }, raw: true }),
  ]);

  const byBranch = new Map(grants.map((g) => [Number(g.branchId), g]));

  res.json({
    userId: user.id,
    userName: user.name,
    // An Admin's access is not editable here; it is inherent to the role.
    isAdmin: (await Role.findByPk(user.roleId))?.name === 'Admin',
    // No grants at all means the user still falls back to their home branch.
    usingFallback: grants.length === 0,
    homeBranchId: user.branchId,
    levels: ACCESS_LEVELS.map((level) => ({ level, meaning: ACCESS_MEANING[level] })),
    locations: locations.map((location) => ({
      ...location.toJSON(),
      granted: byBranch.has(location.id),
      accessLevel: byBranch.get(location.id)?.accessLevel || null,
      isPrimary: Boolean(byBranch.get(location.id)?.isPrimary),
    })),
  });
});

/** Replaces a user's location grants with the set the screen is showing. */
export const saveUserLocations = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const role = await Role.findByPk(user.roleId);
  if (role?.name === 'Admin') {
    return res.status(400).json({
      message: 'An Admin works at every location by definition; there is nothing to grant.',
    });
  }

  const count = await setUserLocations(user.id, req.body.locations || [], req.user?.id);

  // The user's home branch follows their primary grant, so the next sign-in
  // lands somewhere they can actually work.
  const primary = await primaryLocationId({ id: user.id, role: role?.name, branchId: user.branchId });
  if (primary && primary !== user.branchId) {
    await user.update({ branchId: primary, authlstedit: req.user?.id });
  }

  res.json({
    message: count
      ? `${count} location${count === 1 ? '' : 's'} granted`
      : 'All grants removed — this user falls back to their home branch',
    granted: count,
  });
});

/** Replaces one role's visible menus. */
export const saveMenuRights = asyncHandler(async (req, res) => {
  const role = await Role.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!role) return res.status(404).json({ message: 'Role not found' });
  if (role.name === 'Admin') {
    return res.status(403).json({ message: 'The Admin role always sees every menu' });
  }

  const requested = Array.isArray(req.body.menus) ? req.body.menus : [];
  // Drop anything unknown, and keep the pages every role must retain.
  const menus = [...new Set([
    ...requested.filter((key) => ALL_MENU_KEYS.includes(key)),
    ...ALWAYS_VISIBLE,
  ])];

  await role.update({
    permissions: { ...(role.permissions || {}), menus },
    authlstedit: req.user?.id,
  });

  res.json({ id: role.id, name: role.name, menus });
});

export const createRole = asyncHandler(async (req, res) => {
  const existing = await Role.findOne({ where: { name: req.body.name, detstatus: false } });
  if (existing) return res.status(409).json({ message: 'Role name already exists' });
  const role = await Role.create({
    name: req.body.name,
    permissions: req.body.permissions || {},
    authadd: req.user?.id
  });
  res.status(201).json(role);
});

export const updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!role) return res.status(404).json({ message: 'Role not found' });
  if (role.name === 'Admin') return res.status(403).json({ message: 'Cannot modify Admin role' });
  
  await role.update({
    name: req.body.name,
    permissions: req.body.permissions || {},
    authlstedit: req.user?.id
  });
  res.json(role);
});

export const deleteRole = asyncHandler(async (req, res) => {
  const role = await Role.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!role) return res.status(404).json({ message: 'Role not found' });
  if (role.name === 'Admin') return res.status(403).json({ message: 'Cannot delete Admin role' });
  
  const inUse = await User.count({ where: { roleId: role.id, detstatus: false } });
  if (inUse > 0) return res.status(409).json({ message: 'Role is in use by active users' });

  await role.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  res.status(204).send();
});

export const createUser = asyncHandler(async (req, res) => {
  // The email unique index spans soft-deleted rows too, so check without filtering on detstatus.
  const existing = await User.findOne({ where: { email: req.body.email } });
  if (existing) return res.status(409).json({ message: 'Email is already registered' });
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    mobile: req.body.mobile,
    roleId: req.body.roleId,
    branchId: req.body.branchId || null,
    isActive: req.body.isActive ?? true,
    passwordHash: await bcrypt.hash(req.body.password, Number(process.env.BCRYPT_ROUNDS || 12)),
    authadd: req.user?.id
  });
  const created = await User.findByPk(user.id, { include: Role });
  res.status(201).json(publicUser(created));
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (req.body.email && req.body.email !== user.email) {
    const taken = await User.findOne({ where: { email: req.body.email } });
    if (taken) return res.status(409).json({ message: 'Email is already registered' });
  }
  const payload = {
    name: req.body.name,
    email: req.body.email,
    mobile: req.body.mobile,
    roleId: req.body.roleId,
    ...(req.body.branchId !== undefined ? { branchId: req.body.branchId || null } : {}),
    isActive: req.body.isActive,
    authlstedit: req.user?.id
  };
  if (req.body.password) payload.passwordHash = await bcrypt.hash(req.body.password, Number(process.env.BCRYPT_ROUNDS || 12));
  await user.update(payload);
  const updated = await User.findByPk(user.id, { include: Role });
  res.json(publicUser(updated));
});

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  await user.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  res.status(204).send();
});
