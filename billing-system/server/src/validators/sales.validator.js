import { body } from 'express-validator';

const commonItems = [
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt(),
  body('items.*.quantity').isFloat({ gt: 0 }),
  body('items.*.rate').optional({ nullable: true }).isFloat({ min: 0 }),
  body('items.*.discount').optional().isFloat({ min: 0 }),
  body('items.*.gstPercent').optional().isFloat({ min: 0, max: 100 }),
];

export const salesOrderRules = [
  body('orderDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('expectedDeliveryDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('customerId').isInt(),
  body('status').optional().isIn(['Draft', 'Confirmed', 'Processing', 'Delivered', 'Cancelled']),
  ...commonItems
];

export const salesReturnRules = [
  body('returnDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('customerId').isInt(),
  body('invoiceId').optional({ nullable: true }).isInt(),
  body('status').optional().isIn(['Draft', 'Confirmed', 'Refunded']),
  body('reason').optional({ checkFalsy: true }).isString(),
  ...commonItems
];
