import bcrypt from 'bcrypt';
import { Role, User } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, mobile: user.mobile, isActive: user.isActive, role: user.Role?.name, roleId: user.roleId });

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await User.findAndCountAll({ where: { detstatus: false }, include: Role, limit, offset, order: [['addondt', 'DESC']] });
  res.json(paged(rows.map(publicUser), count, page, limit));
});

export const listRoles = asyncHandler(async (_req, res) => {
  res.json(await Role.findAll({ where: { detstatus: false }, order: [['name', 'ASC']] }));
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
  const existing = await User.findOne({ where: { email: req.body.email, detstatus: false } });
  if (existing) return res.status(409).json({ message: 'Email is already registered' });
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    mobile: req.body.mobile,
    roleId: req.body.roleId,
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
  const payload = {
    name: req.body.name,
    email: req.body.email,
    mobile: req.body.mobile,
    roleId: req.body.roleId,
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
