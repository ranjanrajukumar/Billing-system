import { body } from 'express-validator';

export const expenseRules = [
  body('expenseDate').isISO8601().toDate(),
  body('branchId').optional({ nullable: true }).isInt(),
  body('categoryId').optional({ nullable: true }).isInt(),
  body('amount').isFloat({ min: 0 }),
  body('taxAmount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('payeeName').optional({ checkFalsy: true }).isString(),
  body('referenceNo').optional({ checkFalsy: true }).isString(),
  body('remarks').optional({ checkFalsy: true }).isString()
];
