/**
 * The application's menu, defined once on the server so the sidebar, the rights
 * screen and any future checks all work from the same list.
 *
 * `path` matches the client route. Menu rights control what a role can *see*;
 * the API still enforces its own authorize() rules on every request.
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
  { group: 'Inventory', items: [
    { key: 'products', label: 'Products', path: '/products' },
    { key: 'inventory', label: 'Inventory', path: '/inventory' },
    { key: 'batches', label: 'Seed Batches', path: '/batches' },
    { key: 'purchases', label: 'Purchases', path: '/purchases' },
    { key: 'suppliers', label: 'Suppliers', path: '/suppliers' },
    { key: 'masters', label: 'Masters', path: '/masters' },
  ]},
  { group: 'Administration', items: [
    { key: 'users', label: 'Users & Roles', path: '/users' },
    { key: 'branches', label: 'Branches', path: '/branches' },
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
    'salesReturns', 'customers', 'udhar', 'khata',
    // Counter staff need to see lots to pick one while billing.
    'products', 'inventory', 'batches', 'profile',
  ],
};

/**
 * Menu keys a role may see. Falls back to the defaults above when a role has
 * nothing configured, so existing roles keep working.
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
