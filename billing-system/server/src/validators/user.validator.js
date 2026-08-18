import { body } from 'express-validator';

export const userRules = [
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Name must be between 2 and 120 characters'),
  body('email').isEmail().withMessage('Invalid email address format'),
  body('mobile').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
  body('roleId').isInt({ min: 1 }).withMessage('Valid role is required'),
  body('isActive').optional().isBoolean()
];

export const userCreateRules = [
  ...userRules,
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

export const userUpdateRules = [
  ...userRules,
  body('password').optional({ checkFalsy: true }).isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

export const roleRules = [
  body('name').trim().isLength({ min: 2 }).withMessage('Role name must be at least 2 characters')
];
