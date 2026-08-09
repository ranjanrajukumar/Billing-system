import { Router } from 'express';
import { body } from 'express-validator';
import { ageing, collect, customerLedger, summary } from '../controllers/udhar.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const collectRules = [
  body('customerId').isInt(),
  body('amount').isFloat({ gt: 0 }),
  body('paymentMethod').optional({ checkFalsy: true }).isIn(['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit']),
  body('referenceNumber').optional({ checkFalsy: true }).trim(),
];

router.get('/summary', summary);
router.get('/ageing', ageing);
router.get('/customer/:customerId', customerLedger);
router.post('/collect', authorize('Admin', 'Accountant', 'Sales'), collectRules, validate, collect);

export default router;
