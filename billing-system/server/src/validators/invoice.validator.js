import { body } from 'express-validator';

export const invoiceRules = [
  body('invoiceDate').isISO8601().toDate(),
  body('customerId').isInt(),
  body('paymentMethod').isIn(['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit']),
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt(),
  body('items.*.quantity').isFloat({ gt: 0 }),
  // Optional: a line with no rate is priced from the product, using the
  // customer's tier and the unit being billed. A till that scans a barcode and
  // takes the quantity should not have to know the price to raise a bill.
  body('items.*.rate').optional({ nullable: true }).isFloat({ min: 0 }),
  body('items.*.um').optional({ checkFalsy: true }).isString(),
  body('items.*.mrp').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('items.*.discount').optional().isFloat({ min: 0 }),
  body('items.*.gstPercent').optional().isFloat({ min: 0, max: 100 })
];
