import { body } from 'express-validator';

export const customerRules = [
  body('customerName').trim().notEmpty().withMessage('Customer name is required'),
  body('mobileNumber').trim().notEmpty().withMessage('Mobile number is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email address format'),
  body('gstNumber').optional({ checkFalsy: true }).trim(),
  body('address').optional({ checkFalsy: true }).trim(),
  body('city').optional({ checkFalsy: true }).trim(),
  body('state').optional({ checkFalsy: true }).trim(),
  body('pincode').optional({ checkFalsy: true }).trim(),
];
