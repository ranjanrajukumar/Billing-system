import { body } from 'express-validator';

export const quotationRules = [
  body('quotationDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('validUntil').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('customerId').isInt(),
  body('status').optional().isIn(['Draft', 'Sent', 'Accepted', 'Rejected']),
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt(),
  body('items.*.quantity').isFloat({ gt: 0 }),
  body('items.*.rate').optional({ nullable: true }).isFloat({ min: 0 }),
  body('items.*.discount').optional().isFloat({ min: 0 }),
  body('items.*.gstPercent').optional().isFloat({ min: 0, max: 100 }),
  body('totalAmount').optional().isFloat({ min: 0 })
];
