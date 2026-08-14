import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { AuditLog, Role, User } from '../models/index.js';
import { recordAudit } from '../services/audit.service.js';
import { navigationFor, visibleMenus } from '../config/menu.js';
import { getConfig } from '../services/config.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { imageColumns } from '../utils/imageUpload.js';
import { sendPasswordResetEmail } from '../services/email.service.js';

const signToken = (user) => jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });

const buildAuthResponse = async (user) => {
  // The sidebar is built from these, so what a user is offered at sign-in is
  // already narrowed to the modules this company runs.
  const { mode, modules } = await getConfig();

  return {
    token: signToken(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.Role?.name,
      profileImagePath: user.profileImagePath,
      profileImageUrl: user.profileImageUrl,
      // Menu rights travel with the user so the sidebar can render correctly.
      menus: visibleMenus(user.Role, modules),
      // The sidebar renders from this, so grouping lives on the server only.
      navigation: navigationFor(user.Role, modules),
      modules: [...modules],
      businessMode: mode,
    }
  };
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, mobile } = req.body;
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) return res.status(409).json({ message: 'Email is already registered' });

  const [role] = await Role.findOrCreate({ where: { name: 'Sales' } });
  const user = await User.create({
    name,
    email,
    mobile,
    passwordHash: await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 12)),
    roleId: role.id
  });

  const createdUser = await User.findOne({ where: { id: user.id}, include: Role });
  return res.status(201).json(await buildAuthResponse(createdUser));
});

export const login = asyncHandler(async (req, res) => {
  // Sign-in attempts are not model writes, so they are logged explicitly.
  const failed = (reason) => recordAudit(AuditLog, {
    action: 'LoginFailed',
    entity: 'User',
    summary: `Failed login for ${req.body.email}: ${reason}`,
  });

  const user = await User.findOne({ where: { email: req.body.email }, include: Role });
  if (!user || !user.isActive) {
    failed(user ? 'account inactive' : 'unknown email');
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(req.body.password, user.passwordHash);
  if (!ok) {
    failed('wrong password');
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  recordAudit(AuditLog, {
    userId: user.id,
    userName: user.name,
    action: 'Login',
    entity: 'User',
    entityId: user.id,
    summary: `${user.name} signed in`,
  });
  res.json(await buildAuthResponse(user));
});

export const me = asyncHandler(async (req, res) => res.json({ user: req.user }));

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { email: req.body.email } });
  let issuedToken = null;
  if (user) {
    user.resetToken = crypto.randomBytes(32).toString('hex');
    user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    await sendPasswordResetEmail(user.email, user.resetToken);
    issuedToken = user.resetToken;
  }

  // Without a mail transport the token would be unreachable, so expose it
  // outside production only. The response stays identical in production so it
  // cannot be used to discover which addresses are registered.
  const response = { message: 'If the email exists, a password reset link has been generated' };
  if (issuedToken && process.env.NODE_ENV !== 'production') response.resetToken = issuedToken;
  res.json(response);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    where: { resetToken: req.body.token, resetTokenExpiresAt: { [Op.gt]: new Date() } }
  });
  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });
  user.passwordHash = await bcrypt.hash(req.body.password, Number(process.env.BCRYPT_ROUNDS || 12));
  user.resetToken = null;
  user.resetTokenExpiresAt = null;
  await user.save();
  recordAudit(AuditLog, {
    userId: user.id,
    userName: user.name,
    action: 'PasswordReset',
    entity: 'User',
    entityId: user.id,
    summary: `Password reset for ${user.email}`,
  });
  res.json({ message: 'Password reset successful' });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, { include: Role });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const { name, email, password, mobile } = req.body;
  
  if (email && email !== user.email) {
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email is already taken' });
    user.email = email;
  }
  
  if (name) user.name = name;
  if (mobile !== undefined) user.mobile = mobile;
  
  if (password) {
    user.passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 12));
  }
  
  if (req.file) {
    user.set(imageColumns(req.file, 'profileImage'));
  }

  await user.save();
  res.json(await buildAuthResponse(user));
});
