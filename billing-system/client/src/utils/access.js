/**
 * Which roles may open which page. This mirrors the `authorize(...)` guards on
 * the server — the server is still the authority, this only stops the UI from
 * offering things that would come back as "Forbidden".
 *
 * A page missing from this map is open to every signed-in role.
 */
export const PAGE_ROLES = {
  '/users': ['Admin'],
  '/audit-logs': ['Admin'],
  '/backups': ['Admin'],
  '/reports': ['Admin', 'Accountant'],
  '/tax-reports': ['Admin', 'Accountant'],
};

/** Roles allowed to perform an action, for hiding buttons rather than pages. */
export const ACTION_ROLES = {
  saveSettings: ['Admin', 'Accountant'],
  manageBranches: ['Admin', 'Accountant'],
  deleteBranch: ['Admin'],
  manageUsers: ['Admin'],
  viewAudit: ['Admin'],
  deleteMasters: ['Admin'],
  managePurchases: ['Admin', 'Accountant'],
  // Editing an issued invoice rewrites stock, seed lots, coupon use and loyalty
  // points, so it is narrower than the right to raise one.
  editInvoice: ['Admin', 'Accountant'],
};

/**
 * Menu rights configured per role, keyed by page path. The server sends the
 * allowed keys with the signed-in user; this maps them back to routes.
 */
export const MENU_KEY_BY_PATH = {
  '/': 'dashboard',
  '/quick-bill': 'quickBill',
  '/invoices': 'invoices',
  '/sales-orders': 'salesOrders',
  '/quotations': 'quotations',
  '/delivery-challans': 'deliveryChallans',
  '/sales-returns': 'salesReturns',
  '/customers': 'customers',
  '/udhar': 'udhar',
  '/khata': 'khata',
  '/coupons': 'coupons',
  '/reports': 'reports',
  '/tax-reports': 'taxReports',
  '/products': 'products',
  '/inventory': 'inventory',
  '/batches': 'batches',
  '/purchases': 'purchases',
  '/suppliers': 'suppliers',
  '/masters': 'masters',
  '/users': 'users',
  '/branches': 'branches',
  '/audit-logs': 'auditLogs',
  '/backups': 'backups',
  '/invoice-templates': 'invoiceTemplates',
  '/settings': 'settings',
  '/profile': 'profile',

  // Advanced mode.
  '/purchase-orders': 'purchaseOrders',
  '/grn': 'grn',
  '/purchase-returns': 'purchaseReturns',
  '/stock-transfers': 'stockTransfers',
  '/stock-adjustments': 'stockAdjustments',
  '/stock-counts': 'stockCounts',
  '/serials': 'serials',
  '/warehouses': 'warehouses',
  '/ledgers': 'ledgers',
  '/expenses': 'expenses',
  '/cash-registers': 'cashRegisters',
  '/bank-accounts': 'bankAccounts',
  '/chart-of-accounts': 'chartOfAccounts',
  '/journal-entries': 'journalEntries',
  '/financials': 'financials',
  '/approvals': 'approvals',
  '/cash-flow': 'cashFlow',
  '/stock-audit': 'stockAudit',
  '/warehouse-floor': 'warehouseOps',
};

/** Pages that must stay reachable whatever the rights say. */
const ALWAYS_OPEN = new Set(['/', '/profile']);

/**
 * A page is open when the role's own rules allow it *and* the signed-in user's
 * menu list includes it.
 *
 * The menu list arrives from the server already narrowed to the modules this
 * company has switched on, so it gates Admins too — a disabled module is absent
 * from the product, not merely restricted. Rights only ever narrow access; the
 * API still enforces the real rules on every request.
 */
export function canOpen(path, role, menus = null) {
  const allowedRoles = PAGE_ROLES[path];
  if (allowedRoles && allowedRoles.length > 0) {
    if (!role) return false;
    const roleAllows = role === 'Admin' || allowedRoles.includes(role);
    if (!roleAllows) return false;
  }

  if (ALWAYS_OPEN.has(path)) return true;

  // No list at all means an older session; fall back to role rules only rather
  // than locking the user out of everything.
  if (!Array.isArray(menus) || menus.length === 0) return !role || role === 'Admin' ? true : true;

  const key = MENU_KEY_BY_PATH[path];
  return !key || menus.includes(key);
}

/** Whether a module is switched on for this company. */
export function hasModule(moduleKey, modules) {
  if (!Array.isArray(modules)) return true;
  return modules.includes(moduleKey);
}

export function can(action, role) {
  if (!role) return false;
  if (role === 'Admin') return true;
  const allowed = ACTION_ROLES[action];
  return !allowed || allowed.includes(role);
}
