import { MODULE_BY_MENU, menusForModules } from './modules.js';

/**
 * The application's menu, defined once on the server so the sidebar, the rights
 * screen and any future checks all work from the same list.
 *
 * `path` matches the client route. Menu rights control what a role can *see*;
 * the API still enforces its own authorize() rules on every request.
 *
 * What a menu key belongs to is decided by `config/modules.js` — a key whose
 * module is switched off never reaches the sidebar, whatever the role.
 */
export const MENU_CATALOGUE = [
  { group: 'Overview', items: [
    { key: 'dashboard', label: 'Dashboard', path: '/' },
  ]},
  { group: 'Sales', items: [
    { key: 'quickBill', label: 'Quick Bill', path: '/quick-bill' },
    { key: 'invoices', label: 'Invoices', path: '/invoices' },
    { key: 'salesOrders', label: 'Sales Orders', path: '/sales-orders' },
    { key: 'quotations', label: 'Quotations', path: '/quotations' },
    { key: 'deliveryChallans', label: 'Delivery Challans', path: '/delivery-challans' },
    { key: 'salesReturns', label: 'Sales Returns', path: '/sales-returns' },
    { key: 'customers', label: 'Customers', path: '/customers' },
    { key: 'udhar', label: 'Udhar (Credit)', path: '/udhar' },
    { key: 'khata', label: 'Khata Book', path: '/khata' },
    { key: 'coupons', label: 'Coupons', path: '/coupons' },
    { key: 'reports', label: 'Reports', path: '/reports' },
    { key: 'taxReports', label: 'GST & Receivables', path: '/tax-reports' },
  ]},
  { group: 'Purchasing', items: [
    { key: 'purchaseOrders', label: 'Purchase Orders', path: '/purchase-orders' },
    { key: 'grn', label: 'Goods Receipt (GRN)', path: '/grn' },
    { key: 'purchases', label: 'Purchase Invoices', path: '/purchases' },
    { key: 'purchaseReturns', label: 'Purchase Returns', path: '/purchase-returns' },
    { key: 'suppliers', label: 'Suppliers', path: '/suppliers' },
  ]},
  { group: 'Inventory', items: [
    { key: 'products', label: 'Products', path: '/products' },
    { key: 'inventory', label: 'Inventory', path: '/inventory' },
    { key: 'stockTransfers', label: 'Stock Transfers', path: '/stock-transfers' },
    { key: 'stockAdjustments', label: 'Stock Adjustments', path: '/stock-adjustments' },
    { key: 'stockCounts', label: 'Stock Counting', path: '/stock-counts' },
    { key: 'batches', label: 'Batches & Expiry', path: '/batches' },
    { key: 'serials', label: 'Serial Numbers', path: '/serials' },
    { key: 'masters', label: 'Masters', path: '/masters' },
  ]},
  { group: 'Accounts', items: [
    { key: 'ledgers', label: 'Party Ledgers', path: '/ledgers' },
    { key: 'expenses', label: 'Expenses', path: '/expenses' },
    { key: 'cashRegisters', label: 'Cash Register', path: '/cash-registers' },
    { key: 'bankAccounts', label: 'Bank Accounts', path: '/bank-accounts' },
    { key: 'chartOfAccounts', label: 'Chart of Accounts', path: '/chart-of-accounts' },
    { key: 'journalEntries', label: 'Journal Entries', path: '/journal-entries' },
    { key: 'financials', label: 'Financial Statements', path: '/financials' },
  ]},
  { group: 'Administration', items: [
    { key: 'users', label: 'Users & Roles', path: '/users' },
    { key: 'branches', label: 'Branches', path: '/branches' },
    { key: 'warehouses', label: 'Warehouses', path: '/warehouses' },
    { key: 'approvals', label: 'Approvals', path: '/approvals' },
    { key: 'auditLogs', label: 'Audit Logs', path: '/audit-logs' },
    { key: 'backups', label: 'Backup & Restore', path: '/backups' },
    { key: 'invoiceTemplates', label: 'Invoice Templates', path: '/invoice-templates' },
    { key: 'settings', label: 'Settings', path: '/settings' },
    { key: 'profile', label: 'Profile', path: '/profile' },
  ]},
];

export const ALL_MENU_KEYS = MENU_CATALOGUE.flatMap((g) => g.items.map((i) => i.key));

/** Pages every role keeps, so a role can never be locked out of the app. */
export const ALWAYS_VISIBLE = ['dashboard', 'profile'];

/** Sensible starting rights when a role has none configured yet. */
export const DEFAULT_MENUS_BY_ROLE = {
  Admin: ALL_MENU_KEYS,
  Accountant: ALL_MENU_KEYS.filter((key) => key !== 'users'),
  Sales: [
    'dashboard', 'quickBill', 'invoices', 'salesOrders', 'quotations', 'deliveryChallans',
    'salesReturns', 'customers', 'udhar', 'khata', 'ledgers',
    // Counter staff need to see lots to pick one while billing.
    'products', 'inventory', 'batches', 'profile',
  ],
  'Purchase Manager': [
    'dashboard', 'purchaseOrders', 'grn', 'purchases', 'purchaseReturns', 'suppliers',
    'products', 'inventory', 'approvals', 'reports', 'profile',
  ],
  'Warehouse Manager': [
    'dashboard', 'inventory', 'stockTransfers', 'stockAdjustments', 'stockCounts',
    'batches', 'serials', 'grn', 'products', 'warehouses', 'approvals', 'profile',
  ],
  'Branch Manager': [
    'dashboard', 'quickBill', 'invoices', 'salesReturns', 'customers', 'udhar', 'khata',
    'ledgers', 'products', 'inventory', 'stockTransfers', 'expenses', 'cashRegisters',
    'reports', 'approvals', 'profile',
  ],
  Cashier: [
    'dashboard', 'quickBill', 'invoices', 'customers', 'udhar', 'khata',
    'products', 'inventory', 'cashRegisters', 'profile',
  ],
  Auditor: [
    'dashboard', 'reports', 'taxReports', 'ledgers', 'financials', 'journalEntries',
    'chartOfAccounts', 'auditLogs', 'inventory', 'profile',
  ],
};

/**
 * Menu keys a role may see, before module gating. Falls back to the defaults
 * above when a role has nothing configured, so existing roles keep working.
 */
export function menusForRole(role) {
  if (!role) return [];
  if (role.name === 'Admin') return ALL_MENU_KEYS;

  const configured = role.permissions?.menus;
  if (Array.isArray(configured) && configured.length) {
    return [...new Set([...configured, ...ALWAYS_VISIBLE])];
  }
  return DEFAULT_MENUS_BY_ROLE[role.name] || DEFAULT_MENUS_BY_ROLE.Sales;
}

/**
 * What this role actually sees: their rights narrowed to the modules the
 * company has switched on. Module gating applies to every role including
 * Admin — a disabled module is absent from the product, not merely restricted.
 */
export function visibleMenus(role, enabledModuleKeys) {
  const allowed = menusForModules(enabledModuleKeys);
  return menusForRole(role).filter((key) => allowed.has(key) || ALWAYS_VISIBLE.includes(key));
}

/** The catalogue trimmed to enabled modules, for the menu-rights screen. */
export function catalogueForModules(enabledModuleKeys) {
  const allowed = menusForModules(enabledModuleKeys);
  return MENU_CATALOGUE
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowed.has(item.key) || ALWAYS_VISIBLE.includes(item.key)),
    }))
    .filter((group) => group.items.length > 0);
}

export { MODULE_BY_MENU };
