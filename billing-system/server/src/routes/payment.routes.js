import { Router } from 'express';
import { body } from 'express-validator';
import { createPayment, getInvoicePayments, listPayments, removePayment } from '../controllers/payment.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const paymentRules = [
  body('invoiceId').isInt(),
  body('amount').isFloat({ gt: 0 }),
  body('paymentMethod').isIn(['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit']),
  body('referenceNumber').optional({ checkFalsy: true }).trim(),
  body('paidAt').optional({ checkFalsy: true }).isISO8601()
];

router.get('/', listPayments);
router.get('/invoice/:invoiceId', getInvoicePayments);
router.post('/', authorize('Admin', 'Accountant', 'Sales'), paymentRules, validate, createPayment);
router.delete('/:id', authorize('Admin', 'Accountant'), removePayment);

export default router;
