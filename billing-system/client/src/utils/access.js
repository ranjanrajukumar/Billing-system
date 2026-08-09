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
};

/**
 * Menu rights configured per role, keyed by page path. The server sends the
 * allowed keys with the signed-in user; this maps them back to routes.
 */
export const MENU_KEY_BY_PATH = {
  '/': 'dashboard',
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
  '/invoice-templates': 'invoiceTemplates',
  '/settings': 'settings',
  '/profile': 'profile',
};

/**
 * A page is open when the role's own rules allow it *and* the role's configured
 * menu rights include it. Rights only ever narrow access, never widen it — the
 * API still enforces the real rules on every request.
 */
export function canOpen(path, role, menus = null) {
  if (!role) return false;

  const allowedRoles = PAGE_ROLES[path];
  const roleAllows = role === 'Admin' || !allowedRoles || allowedRoles.includes(role);
  if (!roleAllows) return false;

  // Admins configure menu rights, so hiding a page from them is a trap: a stale
  // or incomplete rights list would remove the very screen used to fix it.
  if (role === 'Admin') return true;

  if (!Array.isArray(menus) || menus.length === 0) return true;
  const key = MENU_KEY_BY_PATH[path];
  return !key || menus.includes(key);
}

export function can(action, role) {
  if (!role) return false;
  if (role === 'Admin') return true;
  const allowed = ACTION_ROLES[action];
  return !allowed || allowed.includes(role);
}
