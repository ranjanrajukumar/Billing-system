import { body } from 'express-validator';

export const bankRules = [
  body('accountName').notEmpty().isString(),
  body('bankName').optional({ checkFalsy: true }).isString(),
  body('accountNumber').optional({ checkFalsy: true }).isString(),
  body('ifsc').optional({ checkFalsy: true }).isString(),
  body('branchId').optional({ nullable: true }).isInt(),
  body('openingBalance').optional().isFloat({ min: 0 })
];

export const bankEntryRules = [
  body('entryType').isIn(['Deposit', 'Withdrawal', 'Customer Receipt', 'Supplier Payment', 'Transfer In', 'Transfer Out', 'Charges', 'Interest']),
  body('amount').isFloat({ gt: 0 }),
  body('instrumentNo').optional({ checkFalsy: true }).isString(),
  body('partyName').optional({ checkFalsy: true }).isString(),
  body('notes').optional({ checkFalsy: true }).isString()
];
