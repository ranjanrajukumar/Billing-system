import { body } from 'express-validator';

export const productRules = [
  body('productName').trim().isLength({ min: 2, max: 180 }),
  body('categoryId').optional({ nullable: true }).isInt(),
  body('hsnCode').trim().notEmpty(),
  body('purchasePrice').isFloat({ min: 0 }),
  body('sellingPrice').isFloat({ min: 0 }),
  body('gstPercent').isFloat({ min: 0, max: 100 }),
  body('stock').isInt({ min: 0 }),
  body('barcode').optional({ checkFalsy: true }).trim(),
  body('lowStockThreshold').optional().isInt({ min: 0 })
];
