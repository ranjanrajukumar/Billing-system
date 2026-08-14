/**
 * The module catalogue: one list that decides what the application offers.
 *
 * A module is a slice of functionality (POS, GRN, accounting...). Each one
 * declares the minimum business mode it belongs to and the menu keys it puts on
 * screen. Basic modules are always on; Advanced modules appear only when the
 * company runs in Advanced mode, and each can still be switched off individually
 * through a feature flag.
 *
 * This is the single source of truth for both the server (what an API will
 * accept) and the client (what the sidebar shows), so the two can never drift.
 */

export const BUSINESS_MODES = ['Basic', 'Advanced'];

export const MODULES = [
  // ---- Always available, in both modes ----
  { key: 'dashboard', label: 'Dashboard', mode: 'Basic', core: true, menus: ['dashboard'] },
  { key: 'products', label: 'Products & Masters', mode: 'Basic', core: true, menus: ['products', 'masters'] },
  { key: 'customers', label: 'Customers', mode: 'Basic', core: true, menus: ['customers'] },
  { key: 'suppliers', label: 'Suppliers', mode: 'Basic', core: true, menus: ['suppliers'] },
  { key: 'pos', label: 'POS Billing', mode: 'Basic', core: true, menus: ['quickBill'] },
  { key: 'sales', label: 'Sales & Invoices', mode: 'Basic', core: true, menus: ['invoices', 'salesReturns'] },
  { key: 'purchases', label: 'Purchases', mode: 'Basic', core: true, menus: ['purchases'] },
  { key: 'inventory', label: 'Inventory', mode: 'Basic', core: true, menus: ['inventory'] },
  { key: 'ledger', label: 'Customer & Supplier Ledger', mode: 'Basic', core: true, menus: ['udhar', 'khata', 'ledgers'] },
  { key: 'payments', label: 'Payments', mode: 'Basic', core: true, menus: [] },
  { key: 'reports', label: 'Reports', mode: 'Basic', core: true, menus: ['reports', 'taxReports'] },
  { key: 'administration', label: 'Administration', mode: 'Basic', core: true, menus: [
    'users', 'settings', 'profile', 'backups', 'invoiceTemplates', 'auditLogs', 'branches',
  ] },

  // ---- Optional in Basic, on by default in Advanced ----
  { key: 'salesOrders', label: 'Quotations & Sales Orders', mode: 'Basic', menus: ['quotations', 'salesOrders', 'deliveryChallans'] },
  { key: 'coupons', label: 'Coupons & Loyalty', mode: 'Basic', menus: ['coupons'] },
  { key: 'batches', label: 'Batch & Expiry Tracking', mode: 'Basic', menus: ['batches'] },

  // ---- Advanced only ----
  { key: 'warehouses', label: 'Warehouses & Locations', mode: 'Advanced', menus: ['warehouses'] },
  { key: 'stockTransfers', label: 'Stock Transfers', mode: 'Advanced', menus: ['stockTransfers'] },
  { key: 'stockAdjustments', label: 'Stock Adjustments & Counting', mode: 'Advanced', menus: ['stockAdjustments', 'stockCounts'] },
  { key: 'purchaseOrders', label: 'Purchase Orders & GRN', mode: 'Advanced', menus: ['purchaseOrders', 'grn'] },
  { key: 'purchaseReturns', label: 'Purchase Returns', mode: 'Advanced', menus: ['purchaseReturns'] },
  { key: 'serials', label: 'Serial Number Tracking', mode: 'Advanced', menus: ['serials'] },
  { key: 'expenses', label: 'Expenses', mode: 'Advanced', menus: ['expenses'] },
  { key: 'cashBank', label: 'Cash & Bank', mode: 'Advanced', menus: ['cashRegisters', 'bankAccounts'] },
  { key: 'accounting', label: 'Accounting', mode: 'Advanced', menus: ['chartOfAccounts', 'journalEntries', 'financials'] },
  { key: 'approvals', label: 'Approval Workflow', mode: 'Advanced', menus: ['approvals'] },
];

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m]));

/** Modules that cannot be switched off — the app would not function without them. */
export const CORE_MODULE_KEYS = MODULES.filter((m) => m.core).map((m) => m.key);

/** Which modules a mode makes *available* (before per-flag overrides). */
export function availableModules(mode) {
  return MODULES.filter((m) => m.mode === 'Basic' || mode === 'Advanced');
}

/**
 * Resolves the effective module set from the company's mode plus the saved
 * flags. A flag can only turn off a module the mode already allows, and never
 * turns off a core one — so a bad flag row can't lock anyone out.
 */
export function resolveModules({ mode = 'Basic', flags = {} } = {}) {
  const enabled = new Set();
  for (const module of availableModules(mode)) {
    if (module.core) { enabled.add(module.key); continue; }
    const flag = flags[module.key];
    // Unset means "follow the mode": Advanced modules default on in Advanced.
    if (flag === undefined ? true : Boolean(flag)) enabled.add(module.key);
  }
  return enabled;
}

/** The menu keys the enabled modules put on screen. */
export function menusForModules(enabledKeys) {
  const menus = new Set();
  for (const key of enabledKeys) {
    for (const menu of MODULE_BY_KEY[key]?.menus || []) menus.add(menu);
  }
  return menus;
}

/** The module a menu key belongs to, used to gate routes by feature. */
export const MODULE_BY_MENU = Object.fromEntries(
  MODULES.flatMap((m) => m.menus.map((menu) => [menu, m.key])),
);
