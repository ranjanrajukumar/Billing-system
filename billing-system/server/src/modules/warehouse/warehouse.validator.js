import { body } from 'express-validator';

export const warehouseRules = [
  body('branchName').trim().notEmpty().withMessage('Warehouse name is required').isLength({ max: 120 }),
  body('branchCode').trim().notEmpty().withMessage('Warehouse code is required').isLength({ max: 40 }),
  body('locationType').optional().isIn(['Branch', 'Warehouse', 'Store']),
  body('city').optional({ checkFalsy: true }).trim().isLength({ max: 80 }),
  body('state').optional({ checkFalsy: true }).trim().isLength({ max: 80 }),
  body('address').optional({ checkFalsy: true }).trim(),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 40 }),
  body('canSell').optional().isBoolean()
];

export const binRules = [
  body('code').trim().notEmpty().withMessage('Bin code is required').isLength({ max: 60 }),
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
  body('level').isIn(['Zone', 'Aisle', 'Rack', 'Shelf', 'Bin']).withMessage('Invalid bin level'),
  body('parentId').optional({ nullable: true }).isInt(),
];
