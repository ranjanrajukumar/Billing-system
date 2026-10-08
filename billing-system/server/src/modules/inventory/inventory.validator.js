import { body } from 'express-validator';
import { ADJUSTMENT_REASONS } from '../../models/stockAdjustment.model.js';

const adjustmentItems = [
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt(),
  body('items.*.quantity').isFloat() // Can be negative or positive
];

const transferItems = [
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt(),
  body('items.*.quantity').isFloat({ gt: 0 })
];

export const stockAdjustmentRules = [
  body('adjustmentDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  // The column is an enum; anything else would fail the insert with a 500.
  body('reason').optional({ checkFalsy: true }).isIn(ADJUSTMENT_REASONS),
  ...adjustmentItems
];

export const stockTransferRules = [
  body('transferDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('fromBranchId').isInt(),
  body('toBranchId').isInt(),
  body('reason').optional({ checkFalsy: true }).isString(),
  ...transferItems
];

export const stockCountRules = [
  body('countDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('remarks').optional({ checkFalsy: true }).isString(),
  body('branchId').isInt(),
];
