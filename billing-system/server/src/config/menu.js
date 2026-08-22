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
    // The documents of one flow, nested under it. A sales order, the challan
    // that ships it and the invoice that bills it are three views of the same
    // transaction, and a flat list of thirteen entries says nothing about
    // which of them follow from which.
    { key: 'orderToCash', label: 'Order to Cash', path: '/process/order-to-cash', process: true, children: [
      { key: 'quotations', label: 'Quotations', path: '/quotations' },
      { key: 'salesOrders', label: 'Sales Orders', path: '/sales-orders' },
      { key: 'deliveryChallans', label: 'Delivery Challans', path: '/delivery-challans' },
      { key: 'invoices', label: 'Invoices', path: '/invoices' },
      { key: 'salesReturns', label: 'Sales Returns', path: '/sales-returns' },
    ]},
    { key: 'subscriptions', label: 'Subscriptions', path: '/subscriptions' },
    { key: 'customers', label: 'Customers', path: '/customers' },
    { key: 'udhar', label: 'Udhar (Credit)', path: '/udhar' },
    { key: 'khata', label: 'Khata Book', path: '/khata' },
    { key: 'coupons', label: 'Coupons', path: '/coupons' },
    { key: 'reports', label: 'Reports', path: '/reports' },
    { key: 'taxReports', label: 'GST & Receivables', path: '/tax-reports' },
  ]},
  { group: 'Purchasing', items: [
    { key: 'procureToStock', label: 'Procure to Stock', path: '/process/procure-to-stock', process: true, children: [
      { key: 'purchaseOrders', label: 'Purchase Orders', path: '/purchase-orders' },
      { key: 'inboundAppointments', label: 'Inbound Appointments', path: '/inbound-appointments' },
      { key: 'grn', label: 'Goods Receipt (GRN)', path: '/grn' },
      { key: 'qcInspections', label: 'QC Inspections', path: '/qc' },
      { key: 'purchases', label: 'Purchase Invoices', path: '/purchases' },
      { key: 'purchaseReturns', label: 'Purchase Returns', path: '/purchase-returns' },
    ]},
    { key: 'suppliers', label: 'Suppliers', path: '/suppliers' },
  ]},
  // Planning is what the business intends to happen; Inventory below is what
  // has happened. Kept as its own group because the people who work in it —
  // planners and buyers — rarely touch the day-to-day stock screens.
  { group: 'Planning', items: [
    { key: 'planToReplenish', label: 'Plan to Replenish', path: '/process/plan-to-replenish', process: true, children: [
      { key: 'demandPlanning', label: 'Demand Planning', path: '/demand-planning' },
      { key: 'replenishment', label: 'Replenishment', path: '/replenishment' },
      { key: 'inventoryPolicies', label: 'Stock Policies', path: '/inventory-policies' },
    ]},
  ]},
  // Inventory answers "what do we sell and how much is there" — the questions
  // a shop with a single room still has.
  { group: 'Inventory', items: [
    { key: 'products', label: 'Products', path: '/products' },
    { key: 'inventory', label: 'Inventory', path: '/inventory' },
    { key: 'srv', label: 'Store Receipt Voucher (SRV)', path: '/srv' },
    // Issue and return are one operation seen from two ends, so they are one
    // entry with two children rather than two entries that happen to sit
    // next to each other.
    { key: 'issueToReturn', label: 'Issue to Return', path: '/process/issue-to-return', process: true, children: [
      { key: 'stockIssues', label: 'Store Issue (SIV)', path: '/stock-issues' },
      { key: 'stockIssueReturns', label: 'Material Returns (MRN)', path: '/stock-issue-returns' },
    ]},
    { key: 'batches', label: 'Batches & Expiry', path: '/batches' },
    { key: 'masters', label: 'Masters', path: '/masters' },
  ]},
  // Warehouse is the building and what physically happens inside it. Kept
  // separate because these are jobs somebody walks around doing, not figures
  // somebody looks up — and because a shop without a godown never sees any of
  // it once the module is off.
  { group: 'Warehouse', items: [
    // Setup rather than flow: the building is described once and then worked
    // in. It stays flat for the same reason the chart of accounts does.
    { key: 'warehouses', label: 'Warehouses & Bins', path: '/warehouses' },
    { key: 'pickToShip', label: 'Pick to Ship', path: '/process/pick-to-ship', process: true, children: [
      { key: 'pickWaves', label: 'Pick Waves', path: '/waves' },
      { key: 'warehouseOps', label: 'Warehouse Floor', path: '/warehouse-floor' },
      { key: 'shipments', label: 'Shipments', path: '/shipments' },
      { key: 'gatepasses', label: 'Gatepasses', path: '/gatepasses' },
    ]},
    // Counting, correcting and then checking that the correction held. Three
    // screens that are only ever used in that order, and which were sitting in
    // two different groups.
    { key: 'countToCorrect', label: 'Count to Correct', path: '/process/count-to-correct', process: true, children: [
      { key: 'stockCounts', label: 'Stock Counting', path: '/stock-counts' },
      { key: 'stockAdjustments', label: 'Stock Adjustments', path: '/stock-adjustments' },
      { key: 'stockAudit', label: 'Stock Audit', path: '/stock-audit' },
    ]},
    // One screen, so no submenu: nesting a single child buys a click and no
    // compaction. Its stages still show up on the Pick to Ship overview,
    // because goods in transit are goods out of the building.
    { key: 'stockTransfers', label: 'Stock Transfers', path: '/stock-transfers' },
    { key: 'repairs', label: 'Damage & Repairs', path: '/repairs' },
    { key: 'stockOwners', label: 'Stock Owners', path: '/stock-owners' },
    { key: 'serials', label: 'Serial Numbers', path: '/serials' },
    // The hardware and what it reports. Nested because they are only ever
    // looked at together: a reading nobody can attribute to a gateway, or a
    // tag sweep from a reader nobody registered, is not worth reading.
    { key: 'connectedFloor', label: 'Connected Floor', path: '/process/connected-floor', process: true, children: [
      { key: 'devices', label: 'Devices & Scanners', path: '/devices' },
      { key: 'sensors', label: 'Temperature & Humidity', path: '/sensors' },
      { key: 'rfidTags', label: 'RFID Tags', path: '/rfid-tags' },
    ]},
  ]},
  { group: 'Accounts', items: [
    { key: 'recordToReport', label: 'Record to Report', path: '/process/record-to-report', process: true, children: [
      { key: 'expenses', label: 'Expenses', path: '/expenses' },
      { key: 'cashRegisters', label: 'Cash Register', path: '/cash-registers' },
      { key: 'bankAccounts', label: 'Bank Accounts', path: '/bank-accounts' },
      { key: 'ledgers', label: 'Party Ledgers', path: '/ledgers' },
      { key: 'journalEntries', label: 'Journal Entries', path: '/journal-entries' },
      { key: 'financials', label: 'Financial Statements', path: '/financials' },
    ]},
    { key: 'chartOfAccounts', label: 'Chart of Accounts', path: '/chart-of-accounts' },
    { key: 'cashFlow', label: 'Cash Flow', path: '/cash-flow' },
  ]},
  { group: 'Administration', items: [
    { key: 'users', label: 'Users & Roles', path: '/users' },
    { key: 'branches', label: 'Branches', path: '/branches' },
    { key: 'approvals', label: 'Approvals', path: '/approvals' },
    { key: 'auditLogs', label: 'Audit Logs', path: '/audit-logs' },
    { key: 'backups', label: 'Backup & Restore', path: '/backups' },
    { key: 'webhooks', label: 'API & Webhooks', path: '/webhooks' },
    { key: 'invoiceTemplates', label: 'Invoice Templates', path: '/invoice-templates' },
    { key: 'settings', label: 'Settings', path: '/settings' },
    { key: 'profile', label: 'Profile', path: '/profile' },
  ]},
];

/**
 * Every item that is actually a screen, wherever it sits in the tree.
 *
 * A process parent is not one of them. It has a page of its own, but it is not
 * a right anybody is granted or a module anybody switches on — it is visible
 * exactly when one of its children is, and derived that way below. Granting it
 * separately would let a role hold the overview of a flow it cannot open a
 * single document in.
 */
export const leavesOf = (item) => (item.children ? item.children : [item]);

const ALL_ITEMS = MENU_CATALOGUE.flatMap((g) => g.items.flatMap(leavesOf));

export const ALL_MENU_KEYS = ALL_ITEMS.map((i) => i.key);

/** The process pages, by the key their route carries. */
export const PROCESSES = MENU_CATALOGUE
  .flatMap((g) => g.items)
  .filter((item) => item.process);

/**
 * Processes by the last segment of their path.
 *
 * The URL says `order-to-cash` and the code says `orderToCash`, and both are
 * right for where they are: a hyphenated slug is what every other route in the
 * app looks like, and a camelCase key is what every other menu entry is called.
 * Resolving between them once, here, is what stops the two conventions leaking
 * into each other.
 */
export const PROCESS_BY_SLUG = Object.fromEntries(
  PROCESSES.map((p) => [p.path.split('/').pop(), p]),
);

/**
 * Every screen's path, against the menu key that guards it.
 *
 * A process overview reports stages that are not always its own documents —
 * "goods in transit" belongs on Pick to Ship and lives on the transfers screen,
 * which sits outside it. Deciding whether a stage is a link therefore has to be
 * asked of the whole menu, not of one process's children, or a stage pointing
 * anywhere sensible would render permanently locked.
 */
export const KEY_BY_PATH = Object.fromEntries(ALL_ITEMS.map((i) => [i.path, i.key]));

/** Pages every role keeps, so a role can never be locked out of the app. */
export const ALWAYS_VISIBLE = ['dashboard', 'profile'];

/** Sensible starting rights when a role has none configured yet. */
export const DEFAULT_MENUS_BY_ROLE = {
  Admin: ALL_MENU_KEYS,
  Accountant: ALL_MENU_KEYS.filter((key) => key !== 'users'),
  Sales: [
    'dashboard', 'quickBill', 'invoices', 'subscriptions', 'salesOrders', 'quotations', 'deliveryChallans',
    'salesReturns', 'customers', 'udhar', 'khata', 'ledgers',
    // Counter staff need to see lots to pick one while billing.
    'products', 'inventory', 'batches', 'profile',
  ],
  'Purchase Manager': [
    'dashboard', 'purchaseOrders', 'grn', 'srv', 'purchases', 'purchaseReturns', 'suppliers',
    'products', 'inventory', 'approvals', 'reports', 'demandPlanning', 'replenishment', 'inventoryPolicies', 'profile',
  ],
  'Warehouse Manager': [
    'dashboard', 'inventory', 'stockTransfers', 'stockAdjustments', 'stockCounts',
    'batches', 'serials', 'grn', 'srv', 'stockIssues', 'stockIssueReturns',
    'products', 'warehouses', 'warehouseOps', 'stockOwners',
    'stockAudit', 'approvals', 'demandPlanning', 'replenishment', 'inboundAppointments', 'qcInspections', 'pickWaves', 'shipments', 'repairs',
    'devices', 'sensors', 'rfidTags', 'profile',
  ],
  'Branch Manager': [
    'dashboard', 'quickBill', 'invoices', 'salesReturns', 'customers', 'udhar', 'khata',
    'ledgers', 'products', 'inventory', 'stockTransfers', 'expenses', 'cashRegisters',
    // A branch issues consumables to its own staff without ever seeing a
    // warehouse, so this belongs here as much as it does on the floor.
    'stockIssues', 'stockIssueReturns',
    'cashFlow', 'stockAudit', 'reports', 'approvals', 'demandPlanning', 'replenishment', 'profile',
  ],
  Cashier: [
    'dashboard', 'quickBill', 'invoices', 'customers', 'udhar', 'khata',
    'products', 'inventory', 'cashRegisters', 'profile',
  ],
  Auditor: [
    'dashboard', 'reports', 'taxReports', 'ledgers', 'financials', 'journalEntries',
    'chartOfAccounts', 'auditLogs', 'inventory', 'stockAudit', 'cashFlow', 'profile',
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

/**
 * The navigation this user actually gets: the catalogue, grouped, trimmed to
 * their rights and to the modules the company runs.
 *
 * Sent with the signed-in user so the sidebar renders from this rather than
 * keeping its own copy of the menu. The client supplies icons and nothing
 * else — grouping, labels, ordering and gating are decided here, once, so the
 * two can no longer drift apart.
 */
/**
 * Trims a group's items to what `keep` allows, keeping the nesting.
 *
 * A process parent survives on its children: if none of them are left there is
 * nothing for its overview page to overview, so it goes too. This is the only
 * place that rule is written down, so the sidebar and the rights screen cannot
 * come to different conclusions about the same tree.
 */
function pruneItems(items, keep) {
  return items
    .map((item) => {
      if (!item.children) return keep(item.key) ? item : null;
      const children = item.children.filter((child) => keep(child.key));
      return children.length ? { ...item, children } : null;
    })
    .filter(Boolean);
}

export function navigationFor(role, enabledModuleKeys) {
  const visible = new Set(visibleMenus(role, enabledModuleKeys));

  return MENU_CATALOGUE
    .map((group) => ({
      group: group.group,
      items: pruneItems(group.items, (key) => visible.has(key)),
    }))
    .filter((group) => group.items.length > 0);
}

/** The catalogue trimmed to enabled modules, for the menu-rights screen. */
export function catalogueForModules(enabledModuleKeys) {
  const allowed = menusForModules(enabledModuleKeys);
  const keep = (key) => allowed.has(key) || ALWAYS_VISIBLE.includes(key);

  return MENU_CATALOGUE
    .map((group) => ({ ...group, items: pruneItems(group.items, keep) }))
    .filter((group) => group.items.length > 0);
}

export { MODULE_BY_MENU };
