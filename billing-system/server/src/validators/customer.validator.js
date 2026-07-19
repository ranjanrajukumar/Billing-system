import { body } from 'express-validator';

export const customerRules = [
  body('customerName').trim().isLength({ min: 2, max: 160 }),
  body('mobileNumber').trim().isLength({ min: 7, max: 20 }),
  body('email').optional({ checkFalsy: true }).isEmail(),
  body('gstNumber').optional({ checkFalsy: true }).isLength({ min: 5, max: 20 }),
  body('address').trim().notEmpty(),
  body('city').trim().notEmpty(),
  body('state').trim().notEmpty(),
  body('pincode').trim().isLength({ min: 4, max: 10 })
];
