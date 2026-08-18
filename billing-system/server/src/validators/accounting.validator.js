import { body } from 'express-validator';

export const accountRules = [
  body('accountName').notEmpty().isString(),
  body('accountType').isIn(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']),
  body('accountNumber').optional({ checkFalsy: true }).isString(),
  body('openingBalance').optional().isFloat({ min: 0 }),
  body('openingBalanceType').optional().isIn(['Debit', 'Credit'])
];

export const entryRules = [
  body('entryDate').isISO8601().toDate(),
  body('narration').optional({ checkFalsy: true }).isString(),
  body('lines').isArray({ min: 2 }),
  body('lines.*.accountId').isInt(),
  body('lines.*.debit').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('lines.*.credit').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('lines').custom((lines) => {
    let debits = 0;
    let credits = 0;
    for (const line of lines) {
      if (line.debit) debits += Number(line.debit);
      if (line.credit) credits += Number(line.credit);
    }
    if (Math.abs(debits - credits) > 0.01) {
      throw new Error('Debits must equal credits');
    }
    if (debits <= 0) {
      throw new Error('Total debits must be greater than zero');
    }
    return true;
  })
];
