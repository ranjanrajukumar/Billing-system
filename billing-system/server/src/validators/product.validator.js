import { body } from 'express-validator';

/**
 * Shape checks only. What each field *means* — which are optional, which
 * default, which are null when unset — lives in `product.service.js`, so the
 * two never disagree about the same field.
 */
export const productRules = [
  body('productName').trim().notEmpty().withMessage('Product name is required').isLength({ min: 1, max: 180 }),
  body('sku').optional({ checkFalsy: true }).trim().isLength({ max: 60 }),
  body('categoryId').optional({ nullable: true, checkFalsy: true }).isInt(),
  body('brandId').optional({ nullable: true, checkFalsy: true }).isInt(),
  body('hsnCode').optional({ checkFalsy: true }).trim(),

  // Pricing
  body('purchasePrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('sellingPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('mrp').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('wholesalePrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('dealerPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('secondarySellingPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('gstPercent').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }),

  // Selling above the printed price is illegal on an MRP-marked good, so it is
  // refused at entry rather than discovered on a bill.
  body('sellingPrice').custom((value, { req }) => {
    const mrp = Number(req.body?.mrp);
    if (!value || !Number.isFinite(mrp) || mrp <= 0) return true;
    if (Number(value) > mrp) throw new Error('Selling price cannot be more than the MRP');
    return true;
  }),

  // Stock
  body('stock').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('lowStockThreshold').optional({ checkFalsy: true }).isInt({ min: 0 }),
  body('minimumStock').optional({ checkFalsy: true }).isInt({ min: 0 }),
  body('reorderLevel').optional({ checkFalsy: true }).isInt({ min: 0 }),
  body('reorderQuantity').optional({ checkFalsy: true }).isInt({ min: 0 }),

  // Units
  body('primaryUnit').optional({ checkFalsy: true }).trim(),
  body('secondaryUnit').optional({ checkFalsy: true }).trim(),
  body('unitConversionFactor').optional({ checkFalsy: true }).isFloat({ min: 0 }),

  // A secondary unit without a factor above one converts nothing, which reads
  // as a working setup but silently bills the wrong quantity.
  body('secondaryUnit').custom((value, { req }) => {
    if (!value || !String(value).trim()) return true;
    const factor = Number(req.body?.unitConversionFactor);
    if (!Number.isFinite(factor) || factor <= 1) {
      throw new Error('A secondary unit needs a conversion factor greater than 1 (e.g. 1 BOX = 10 PCS)');
    }
    if (String(value).trim() === String(req.body?.primaryUnit || '').trim()) {
      throw new Error('The secondary unit must differ from the primary unit');
    }
    return true;
  }),

  // Tracking
  body('batchRequired').optional().isBoolean(),
  body('expiryRequired').optional().isBoolean(),
  body('serialRequired').optional().isBoolean(),
  body('warrantyMonths').optional({ checkFalsy: true }).isInt({ min: 0 }),

  // Storage. A class the warehouse does not recognise would silently never
  // match a put-away rule, so it is refused rather than accepted and ignored.
  // Space and weight per unit, used by storage billing and shelf limits.
  body('unitVolume').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('unitWeightKg').optional({ checkFalsy: true }).isFloat({ min: 0 }),

  body('storageClass').optional({ checkFalsy: true })
    .isIn(['Standard', 'FastMoving', 'Heavy', 'Cold', 'Hazardous', 'Fragile'])
    .withMessage('Unknown storage class'),

  // Descriptive
  body('size').optional({ checkFalsy: true }).trim().isLength({ max: 40 }),
  body('color').optional({ checkFalsy: true }).trim().isLength({ max: 40 }),
  body('barcode').optional({ checkFalsy: true }).trim(),
  body('isActive').optional().isBoolean()
];
