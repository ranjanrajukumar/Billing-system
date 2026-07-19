import { body } from 'express-validator';

export const loginRules = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
];

export const registerRules = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Name must be between 2 and 120 characters'),
  body('email').isEmail().normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('mobile')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Mobile number must be 20 characters or fewer')
];

export const forgotRules = [body('email').isEmail().normalizeEmail()];

export const resetRules = [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];
