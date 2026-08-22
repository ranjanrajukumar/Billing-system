import { body } from 'express-validator';

const commonItems = [
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt(),
  body('items.*.quantity').isFloat({ gt: 0 }),
  body('items.*.rate').isFloat({ min: 0 }),
  body('items.*.gstPercent').optional().isFloat({ min: 0, max: 100 })
];

export const purchaseRules = [
  body('purchaseDate').isISO8601().toDate(),
  body('supplierId').isInt(),
  body('paidAmount').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['Draft', 'Received']),
  ...commonItems
];

export const purchaseOrderRules = [
  body('orderDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('expectedDeliveryDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('supplierId').isInt(),
  ...commonItems
];

export const purchaseReturnRules = [
  body('returnDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('supplierId').isInt(),
  body('purchaseId').optional({ nullable: true }).isInt(),
  body('reason').optional({ checkFalsy: true }).isString(),
  ...commonItems
];
