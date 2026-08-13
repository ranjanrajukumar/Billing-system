import { body } from 'express-validator';

export const productRules = [
  body('productName').trim().notEmpty().withMessage('Product name is required').isLength({ min: 1, max: 180 }),
  body('categoryId').optional({ nullable: true, checkFalsy: true }).isInt(),
  body('hsnCode').optional({ checkFalsy: true }).trim(),
  body('purchasePrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('sellingPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('gstPercent').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }),
  body('stock').optional({ checkFalsy: true }).isInt({ min: 0 }),
  body('barcode').optional({ checkFalsy: true }).trim(),
  body('lowStockThreshold').optional({ checkFalsy: true }).isInt({ min: 0 }),
  body('primaryUnit').optional({ checkFalsy: true }).trim(),
  body('secondaryUnit').optional({ checkFalsy: true }).trim(),
  body('unitConversionFactor').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('secondarySellingPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('isActive').optional().isBoolean()
];
