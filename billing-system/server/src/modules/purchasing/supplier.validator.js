import { body } from 'express-validator';

export const supplierRules = [
  body('supplierName').trim().isLength({ min: 2, max: 160 }).withMessage('Supplier name is required and must be between 2 and 160 characters'),
  body('contactPerson').optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
  body('mobileNumber').trim().isLength({ min: 7, max: 20 }).withMessage('Valid mobile number is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email address format'),
  body('gstNumber').optional({ checkFalsy: true }).isLength({ min: 5, max: 20 }),
  body('address').optional({ checkFalsy: true }).trim(),
  body('city').optional({ checkFalsy: true }).trim(),
  body('state').optional({ checkFalsy: true }).trim(),
  body('pincode').optional({ checkFalsy: true }).trim().isLength({ min: 4, max: 10 }),
  body('isActive').optional().isBoolean()
];
