import { body } from 'express-validator';

export const invoiceRules = [
  body('invoiceDate').isISO8601().toDate(),
  body('customerId').isInt(),
  body('paymentMethod').isIn(['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit']),
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt(),
  body('items.*.quantity').isFloat({ gt: 0 }),
  body('items.*.rate').isFloat({ min: 0 }),
  body('items.*.discount').optional().isFloat({ min: 0 }),
  body('items.*.gstPercent').optional().isFloat({ min: 0, max: 100 })
];
