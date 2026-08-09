import { Router } from 'express';
import { body } from 'express-validator';
import {
  checkCoupon, couponUsage, createCoupon, getCoupon, listCoupons, removeCoupon, updateCoupon,
} from '../controllers/coupon.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const couponRules = [
  body('code').trim().isLength({ min: 2, max: 40 }),
  body('discountType').isIn(['Percentage', 'Fixed']),
  body('discountValue').isFloat({ gt: 0 }),
  body('minOrderValue').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('maxDiscount').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('usageLimit').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('perCustomerLimit').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('validFrom').optional({ checkFalsy: true }).isISO8601(),
  body('validTo').optional({ checkFalsy: true }).isISO8601(),
];

router.get('/', listCoupons);
// Anyone who can bill needs to be able to check a code at the counter.
router.post('/validate', [body('code').trim().notEmpty(), body('orderValue').isFloat({ min: 0 })], validate, checkCoupon);
router.get('/:id', getCoupon);
router.get('/:id/usage', authorize('Admin', 'Accountant'), couponUsage);
router.post('/', authorize('Admin', 'Accountant'), couponRules, validate, createCoupon);
router.put('/:id', authorize('Admin', 'Accountant'), updateCoupon);
router.delete('/:id', authorize('Admin'), removeCoupon);

export default router;
