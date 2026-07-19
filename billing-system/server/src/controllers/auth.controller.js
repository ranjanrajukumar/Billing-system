import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { Role, User } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const signToken = (user) => jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });

const buildAuthResponse = (user) => ({
  token: signToken(user),
  user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, role: user.Role?.name }
});

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
  return res.status(201).json(buildAuthResponse(createdUser));
});

export const login = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { email: req.body.email }, include: Role });
  if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials' });
  const ok = await bcrypt.compare(req.body.password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  res.json(buildAuthResponse(user));
});

export const me = asyncHandler(async (req, res) => res.json({ user: req.user }));

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { email: req.body.email } });
  if (user) {
    user.resetToken = crypto.randomBytes(32).toString('hex');
    user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    console.log(`Password reset token for ${user.email}: ${user.resetToken}`);
  }
  res.json({ message: 'If the email exists, a password reset link has been generated' });
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
  res.json({ message: 'Password reset successful' });
});
