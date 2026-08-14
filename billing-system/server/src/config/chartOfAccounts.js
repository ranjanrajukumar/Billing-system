/**
 * The default chart of accounts.
 *
 * Codes matter more than names here: the posting service looks accounts up by
 * code, so a business can rename "Sales Revenue" to whatever it calls revenue
 * without breaking a single automatic entry. Accounts marked `system: true`
 * are the ones the posting service needs and cannot be deleted.
 */
export const DEFAULT_ACCOUNTS = [
  // ---- Assets (1xxx) ----
  { code: '1000', name: 'Assets', accountType: 'Asset', normalBalance: 'Debit', isGroup: true },
  { code: '1100', name: 'Current Assets', accountType: 'Asset', normalBalance: 'Debit', isGroup: true, parent: '1000' },
  { code: '1110', name: 'Cash in Hand', accountType: 'Asset', normalBalance: 'Debit', parent: '1100', system: true },
  { code: '1120', name: 'Bank Accounts', accountType: 'Asset', normalBalance: 'Debit', parent: '1100', system: true },
  { code: '1130', name: 'Accounts Receivable', accountType: 'Asset', normalBalance: 'Debit', parent: '1100', system: true },
  { code: '1140', name: 'Inventory', accountType: 'Asset', normalBalance: 'Debit', parent: '1100', system: true },
  { code: '1150', name: 'Input GST (ITC)', accountType: 'Asset', normalBalance: 'Debit', parent: '1100', system: true },
  { code: '1160', name: 'Advance to Suppliers', accountType: 'Asset', normalBalance: 'Debit', parent: '1100' },
  { code: '1200', name: 'Fixed Assets', accountType: 'Asset', normalBalance: 'Debit', isGroup: true, parent: '1000' },
  { code: '1210', name: 'Furniture & Fixtures', accountType: 'Asset', normalBalance: 'Debit', parent: '1200' },
  { code: '1220', name: 'Equipment', accountType: 'Asset', normalBalance: 'Debit', parent: '1200' },

  // ---- Liabilities (2xxx) ----
  { code: '2000', name: 'Liabilities', accountType: 'Liability', normalBalance: 'Credit', isGroup: true },
  { code: '2100', name: 'Current Liabilities', accountType: 'Liability', normalBalance: 'Credit', isGroup: true, parent: '2000' },
  { code: '2110', name: 'Accounts Payable', accountType: 'Liability', normalBalance: 'Credit', parent: '2100', system: true },
  { code: '2120', name: 'Output GST Payable', accountType: 'Liability', normalBalance: 'Credit', parent: '2100', system: true },
  { code: '2130', name: 'Customer Advances', accountType: 'Liability', normalBalance: 'Credit', parent: '2100' },
  { code: '2140', name: 'Salaries Payable', accountType: 'Liability', normalBalance: 'Credit', parent: '2100' },
  { code: '2200', name: 'Loans', accountType: 'Liability', normalBalance: 'Credit', isGroup: true, parent: '2000' },

  // ---- Equity (3xxx) ----
  { code: '3000', name: 'Equity', accountType: 'Equity', normalBalance: 'Credit', isGroup: true },
  { code: '3100', name: 'Capital Account', accountType: 'Equity', normalBalance: 'Credit', parent: '3000' },
  { code: '3200', name: 'Retained Earnings', accountType: 'Equity', normalBalance: 'Credit', parent: '3000', system: true },
  { code: '3300', name: 'Drawings', accountType: 'Equity', normalBalance: 'Debit', parent: '3000' },

  // ---- Income (4xxx) ----
  { code: '4000', name: 'Income', accountType: 'Income', normalBalance: 'Credit', isGroup: true },
  { code: '4100', name: 'Sales Revenue', accountType: 'Income', normalBalance: 'Credit', parent: '4000', system: true },
  { code: '4200', name: 'Sales Returns', accountType: 'Income', normalBalance: 'Debit', parent: '4000', system: true },
  { code: '4300', name: 'Discounts Allowed', accountType: 'Income', normalBalance: 'Debit', parent: '4000', system: true },
  { code: '4400', name: 'Other Income', accountType: 'Income', normalBalance: 'Credit', parent: '4000' },

  // ---- Expenses (5xxx) ----
  { code: '5000', name: 'Expenses', accountType: 'Expense', normalBalance: 'Debit', isGroup: true },
  { code: '5100', name: 'Cost of Goods Sold', accountType: 'Expense', normalBalance: 'Debit', parent: '5000', system: true },
  { code: '5150', name: 'Purchase Returns', accountType: 'Expense', normalBalance: 'Credit', parent: '5000', system: true },
  { code: '5200', name: 'Operating Expenses', accountType: 'Expense', normalBalance: 'Debit', isGroup: true, parent: '5000' },
  { code: '5210', name: 'Rent', accountType: 'Expense', normalBalance: 'Debit', parent: '5200' },
  { code: '5220', name: 'Electricity', accountType: 'Expense', normalBalance: 'Debit', parent: '5200' },
  { code: '5230', name: 'Salaries & Wages', accountType: 'Expense', normalBalance: 'Debit', parent: '5200' },
  { code: '5240', name: 'Transport & Freight', accountType: 'Expense', normalBalance: 'Debit', parent: '5200' },
  { code: '5250', name: 'Maintenance', accountType: 'Expense', normalBalance: 'Debit', parent: '5200' },
  { code: '5260', name: 'Internet & Telephone', accountType: 'Expense', normalBalance: 'Debit', parent: '5200' },
  { code: '5270', name: 'Marketing', accountType: 'Expense', normalBalance: 'Debit', parent: '5200' },
  { code: '5280', name: 'Packaging', accountType: 'Expense', normalBalance: 'Debit', parent: '5200' },
  { code: '5290', name: 'Other Expenses', accountType: 'Expense', normalBalance: 'Debit', parent: '5200', system: true },
  { code: '5300', name: 'Inventory Write-off', accountType: 'Expense', normalBalance: 'Debit', parent: '5000', system: true },
];

/** The codes the posting service depends on, named so call sites stay readable. */
export const ACCOUNTS = {
  CASH: '1110',
  BANK: '1120',
  RECEIVABLE: '1130',
  INVENTORY: '1140',
  INPUT_GST: '1150',
  PAYABLE: '2110',
  OUTPUT_GST: '2120',
  RETAINED_EARNINGS: '3200',
  SALES: '4100',
  SALES_RETURNS: '4200',
  DISCOUNTS: '4300',
  COGS: '5100',
  PURCHASE_RETURNS: '5150',
  OTHER_EXPENSE: '5290',
  INVENTORY_WRITE_OFF: '5300',
};

/** Maps the seeded expense categories onto their ledger accounts. */
export const EXPENSE_CATEGORY_ACCOUNTS = {
  Rent: '5210',
  Electricity: '5220',
  Salary: '5230',
  'Salaries & Wages': '5230',
  Transport: '5240',
  Maintenance: '5250',
  Internet: '5260',
  Marketing: '5270',
  Packaging: '5280',
  Other: '5290',
};
