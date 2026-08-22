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

  // Running costs and the day's cash are things the smallest shop tracks —
  // rent, electricity, what is in the drawer at closing. Only double-entry
  // bookkeeping is genuinely advanced, so these belong in both modes.
  { key: 'expenses', label: 'Expenses', mode: 'Basic', menus: ['expenses'] },
  { key: 'cashBank', label: 'Cash & Bank', mode: 'Basic', menus: ['cashRegisters', 'bankAccounts'] },
  { key: 'cashFlow', label: 'Cash Flow', mode: 'Basic', menus: ['cashFlow'] },
  { key: 'stockAudit', label: 'Stock Audit', mode: 'Basic', menus: ['stockAudit'] },

  // ---- Advanced only ----
  { key: 'warehouses', label: 'Warehouses & Locations', mode: 'Advanced', menus: ['warehouses', 'warehouseOps', 'pickWaves', 'shipments', 'inboundAppointments', 'qcInspections', 'repairs'] },
  { key: 'stockTransfers', label: 'Stock Transfers', mode: 'Advanced', menus: ['stockTransfers'] },
  // Forecasting and replenishment are one module, not two. A forecast nobody
  // orders against is a chart, and a replenishment engine with nothing to
  // predict demand from is a reorder-level alert with extra steps — switching
  // on half of this would leave a screen that cannot answer its own question.
  {
    key: 'demandPlanning',
    label: 'Demand Planning & Replenishment',
    mode: 'Advanced',
    menus: ['demandPlanning', 'replenishment', 'inventoryPolicies'],
  },
  { key: 'stockAdjustments', label: 'Stock Adjustments & Counting', mode: 'Advanced', menus: ['stockAdjustments', 'stockCounts'] },
  { key: 'purchaseOrders', label: 'Purchase Orders, GRN & SRV', mode: 'Advanced', menus: ['purchaseOrders', 'grn', 'srv'] },
  // Issuing material out of the store and getting the unused part back. One
  // module, not two: an issue nobody can return against is a stock adjustment,
  // and a return with no issue behind it is a receipt — switching on half of
  // this would leave a screen that cannot answer its own question.
  { key: 'stockIssues', label: 'Store Issue & Material Return', mode: 'Advanced', menus: ['stockIssues', 'stockIssueReturns'] },
  { key: 'purchaseReturns', label: 'Purchase Returns', mode: 'Advanced', menus: ['purchaseReturns'] },
  { key: 'serials', label: 'Serial Number Tracking', mode: 'Advanced', menus: ['serials'] },
  { key: 'gatepass', label: 'Gatepass', mode: 'Advanced', menus: ['gatepasses'] },
  // Double-entry bookkeeping is the genuinely advanced part: a shop can track
  // every rupee of cost and cash without ever meeting a journal voucher.
  { key: 'accounting', label: 'Accounting (double-entry)', mode: 'Advanced', menus: ['chartOfAccounts', 'journalEntries', 'financials'] },
  { key: 'approvals', label: 'Approval Workflow', mode: 'Advanced', menus: ['approvals'] },
  // Storing goods that belong to other companies. Off by default even in
  // Advanced mode: most warehouses hold only their own stock, and a business
  // that owns everything it stores should never be asked whose goods these are.
  { key: 'thirdParty', label: 'Third-Party (3PL) Stock', mode: 'Advanced', default: false, menus: ['stockOwners'] },

  // Hardware on the floor that talks to us without a person watching. One
  // module, not three: a handheld, a fixed RFID reader and a sensor gateway
  // are the same device register, the same heartbeat and the same idempotent
  // write path, and a site that switches on scanning and not the register
  // would have scanners nobody can name. Off by default even in Advanced —
  // most businesses run this on a laptop and a till, and asking them whose
  // gateway is offline is asking about a building they do not have.
  { key: 'devices', label: 'Scanners, Sensors & RFID', mode: 'Advanced', default: false, menus: ['devices', 'sensors', 'rfidTags'] },

  // Sending this company's trading activity to an address somebody typed.
  // Off by default for the same reason it is Admin-only in the router: it is
  // an ownership decision rather than an operational one.
  { key: 'webhooks', label: 'API & Webhooks', mode: 'Advanced', default: false, menus: ['webhooks'] },
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
    // Unset means "follow the mode": Advanced modules default on in Advanced,
    // unless the module opts out with `default: false`. That opt-out is for
    // features which change how the rest of the system behaves rather than
    // simply adding a screen — turning one on should be a decision, not
    // something a company discovers it has.
    if (flag === undefined ? module.default !== false : Boolean(flag)) enabled.add(module.key);
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
