import api from './api.js';

export const makeResource = (base) => ({
  list: (params) => api.get(base, { params }).then((r) => r.data ?? { data: [], meta: {} }),
  get: (id) => api.get(`${base}/${id}`).then((r) => r.data ?? null),
  create: (payload) => api.post(base, payload).then((r) => r.data ?? {}),
  update: (id, payload) => api.put(`${base}/${id}`, payload).then((r) => r.data ?? {}),
  remove: (id) => api.delete(`${base}/${id}`).then((r) => r.data ?? {}),
});

export const makeMasterDataResource = (masterKey) => makeResource(`/master-data/${masterKey}`);

export const customersApi     = makeResource('/customers');
export const categoriesApi    = makeResource('/categories');
export const productsApi = {
  ...makeResource('/products'),
  import: (formData) => api.post('/products/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
};
export const unitsApi         = makeMasterDataResource('unit');
export const suppliersApi     = makeResource('/suppliers');
export const purchasesApi = {
  ...makeResource('/purchases'),
  uploadAttachment: (id, formData) => api.post(`/purchases/${id}/attachment`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  importCsv: (formData) => api.post('/purchases/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
};
export const invoicesApi      = {
  ...makeResource('/invoices'),
  // Confirm a Draft invoice → validates stock availability and deducts it atomically.
  confirm: (id) => api.post(`/invoices/${id}/confirm`).then((r) => r.data),
};
export const salesOrdersApi   = {
  ...makeResource('/sales-orders'),
  confirm: (id) => api.post(`/sales-orders/${id}/confirm`).then((r) => r.data),
  cancel:  (id) => api.post(`/sales-orders/${id}/cancel`).then((r) => r.data),
  downloadPdf: (id) => api.get(`/sales-orders/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),
};
export const quotationsApi    = makeResource('/quotations');
export const deliveryChallansApi = makeResource('/delivery-challans');
export const salesReturnsApi  = makeResource('/sales-returns');

export const inventoryApi = {
  summary:   ()       => api.get('/inventory/summary').then((r) => r.data ?? {}),
  movements: (params) => api.get('/inventory/movements', { params }).then((r) => r.data ?? { data: [], meta: {} }),
  adjust:    (payload)=> api.post('/inventory/adjust', payload).then((r) => r.data ?? {}),
  // The full stock ledger, with the balance before and after every movement.
  ledger:    (params) => api.get('/inventory/ledger', { params }).then((r) => r.data ?? []),
  valuation: (params) => api.get('/inventory/valuation', { params }).then((r) => r.data ?? {}),
  // WMS current stock — all hierarchy columns (Warehouse/Zone/Aisle/Rack/Shelf/Bin) + available/reserved.
  wmsStock:  (params) => api.get('/inventory/wms-stock', { params }).then((r) => r.data ?? { data: [], meta: {} }),
};

export const invoiceTemplatesApi = {
  ...makeResource('/invoice-templates'),
  preview: (id) => api.get(`/invoice-templates/${id}/preview`, { responseType: 'blob' }).then((r) => r.data),
};

export const paymentsApi = {
  list:      (params) => api.get('/payments', { params }).then((r) => r.data ?? { data: [], meta: {} }),
  forInvoice:(invoiceId) => api.get(`/payments/invoice/${invoiceId}`).then((r) => r.data),
  create:    (payload) => api.post('/payments', payload).then((r) => r.data ?? {}),
  remove:    (id) => api.delete(`/payments/${id}`).then((r) => r.data ?? {}),
};

export const usersApi = {
  ...makeResource('/users'),
  // Which branches and warehouses a user may work at.
  locations:     (id)       => api.get(`/users/${id}/locations`).then((r) => r.data ?? {}),
  saveLocations: (id, body) => api.put(`/users/${id}/locations`, body).then((r) => r.data ?? {}),
  roles: {
    list:   ()           => api.get('/users/roles').then((r) => r.data ?? []),
    create: (payload)    => api.post('/users/roles', payload).then((r) => r.data ?? {}),
    update: (id, payload)=> api.put(`/users/roles/${id}`, payload).then((r) => r.data ?? {}),
    remove: (id)         => api.delete(`/users/roles/${id}`).then((r) => r.data ?? {}),
  },
};

export const dashboardApi = {
  get: (params) => api.get('/dashboard', { params }).then((r) => r.data ?? {}),
  productPerformance: (params) =>
    api.get('/dashboard/product-performance', { params }).then((r) => r.data ?? {}),
};

export const reportsApi = {
  sales:     (params) => api.get('/reports/sales', { params }).then((r) => r.data ?? []),
  gst:       (params) => api.get('/reports/gst', { params }).then((r) => r.data ?? []),
  customers: ()       => api.get('/reports/customers').then((r) => r.data ?? []),
  products:  ()       => api.get('/reports/products').then((r) => r.data ?? []),
  inventory: ()       => api.get('/reports/inventory').then((r) => r.data ?? []),
  // The workbook must cover the same period as the report on screen.
  export:    (type, params) => api.get(`/reports/export/${type}`, { params, responseType: 'blob' }).then((r) => r.data),
};

export const settingsApi = {
  get:         ()       => api.get('/settings').then((r) => r.data ?? {}),
  saveCompany: (payload)=> api.put('/settings/company', payload).then((r) => r.data ?? {}),
  // What this installation currently offers: mode, module states, menu tree.
  modules:     ()       => api.get('/settings/modules').then((r) => r.data ?? {}),
  setMode:     (mode)   => api.put('/settings/mode', { mode }).then((r) => r.data ?? {}),
  setModule:   (key, enabled) => api.put(`/settings/modules/${key}`, { enabled }).then((r) => r.data ?? {}),
};

// ---------------------------------------------------------------------------
// Advanced (ERP) modules. Each mirrors its server router one for one.
// ---------------------------------------------------------------------------

const withAction = (base, actions) => ({ ...makeResource(base), ...actions });

export const stockTransfersApi = withAction('/stock-transfers', {
  approve:  (id)        => api.post(`/stock-transfers/${id}/approve`).then((r) => r.data),
  reject:   (id, reason)=> api.post(`/stock-transfers/${id}/reject`, { reason }).then((r) => r.data),
  pick:     (id)        => api.post(`/stock-transfers/${id}/pick`).then((r) => r.data),
  dispatch: (id, body = {}) => api.post(`/stock-transfers/${id}/dispatch`, body).then((r) => r.data),
  receive:  (id, body = {}) => api.post(`/stock-transfers/${id}/receive`, body).then((r) => r.data),
  cancel:   (id, reason)=> api.post(`/stock-transfers/${id}/cancel`, { reason }).then((r) => r.data),
});

export const stockAdjustmentsApi = withAction('/stock-adjustments', {
  approve: (id)         => api.post(`/stock-adjustments/${id}/approve`).then((r) => r.data),
  reject:  (id, reason) => api.post(`/stock-adjustments/${id}/reject`, { reason }).then((r) => r.data),
});

export const stockCountsApi = withAction('/stock-counts', {
  saveCounts: (id, body) => api.put(`/stock-counts/${id}/counts`, body).then((r) => r.data),
  approve:    (id)       => api.post(`/stock-counts/${id}/approve`).then((r) => r.data),
  cancel:     (id)       => api.post(`/stock-counts/${id}/cancel`).then((r) => r.data),
});

export const purchaseOrdersApi = withAction('/purchase-orders', {
  pendingItems: (id)        => api.get(`/purchase-orders/${id}/pending-items`).then((r) => r.data),
  submit:       (id)        => api.post(`/purchase-orders/${id}/submit`).then((r) => r.data),
  approve:      (id)        => api.post(`/purchase-orders/${id}/approve`).then((r) => r.data),
  reject:       (id, reason)=> api.post(`/purchase-orders/${id}/reject`, { reason }).then((r) => r.data),
  cancel:       (id)        => api.post(`/purchase-orders/${id}/cancel`).then((r) => r.data),
  close:        (id, reason)=> api.post(`/purchase-orders/${id}/close`, { reason }).then((r) => r.data),
});

export const grnApi = withAction('/grn', {
  post:    (id)           => api.post(`/grn/${id}/post`).then((r) => r.data),
  invoice: (id, body = {})=> api.post(`/grn/${id}/invoice`, body).then((r) => r.data),
  cancel:  (id)           => api.post(`/grn/${id}/cancel`).then((r) => r.data),
});

export const srvApi = withAction('/srv', {
  confirm: (id) => api.post(`/srv/${id}/confirm`).then((r) => r.data),
});

export const purchaseReturnsApi = withAction('/purchase-returns', {
  returnable: (purchaseId) => api.get(`/purchase-returns/returnable/${purchaseId}`).then((r) => r.data),
  confirm:    (id)         => api.post(`/purchase-returns/${id}/confirm`).then((r) => r.data),
  cancel:     (id)         => api.post(`/purchase-returns/${id}/cancel`).then((r) => r.data),
});



export const serialsApi = {
  list:    (params) => api.get('/warehouses/serials', { params }).then((r) => r.data ?? { data: [], meta: {} }),
  history: (serial) => api.get(`/warehouses/serials/${serial}`).then((r) => r.data),
  create:  (body)   => api.post('/warehouses/serials', body).then((r) => r.data),
};

export const expensesApi = withAction('/expenses', {
  summary: (params)     => api.get('/expenses/summary', { params }).then((r) => r.data ?? {}),
  approve: (id)         => api.post(`/expenses/${id}/approve`).then((r) => r.data),
  reject:  (id, reason) => api.post(`/expenses/${id}/reject`, { reason }).then((r) => r.data),
  pay:     (id, body)   => api.post(`/expenses/${id}/pay`, body).then((r) => r.data),
  cancel:  (id)         => api.post(`/expenses/${id}/cancel`).then((r) => r.data),
});

export const cashApi = {
  registers:      (params)   => api.get('/cash/registers', { params }).then((r) => r.data ?? { data: [] }),
  register:       (id)       => api.get(`/cash/registers/${id}`).then((r) => r.data),
  transactions:   (id, params) => api.get(`/cash/registers/${id}/transactions`, { params }).then((r) => r.data ?? { data: [] }),
  reconciliation: (params)   => api.get('/cash/registers/reconciliation', { params }).then((r) => r.data ?? {}),
  open:           (body)     => api.post('/cash/registers/open', body).then((r) => r.data),
  close:          (id, body) => api.post(`/cash/registers/${id}/close`, body).then((r) => r.data),
  entry:          (id, body) => api.post(`/cash/registers/${id}/entries`, body).then((r) => r.data),

  banks:          ()         => api.get('/cash/banks').then((r) => r.data ?? []),
  createBank:     (body)     => api.post('/cash/banks', body).then((r) => r.data),
  updateBank:     (id, body) => api.put(`/cash/banks/${id}`, body).then((r) => r.data),
  removeBank:     (id)       => api.delete(`/cash/banks/${id}`).then((r) => r.data),
  bankEntries:    (id, params) => api.get(`/cash/banks/${id}/transactions`, { params }).then((r) => r.data ?? { data: [] }),
  addBankEntry:   (id, body) => api.post(`/cash/banks/${id}/entries`, body).then((r) => r.data),
};

export const accountingApi = {
  accounts:      (params)     => api.get('/accounting/accounts', { params }).then((r) => r.data ?? []),
  accountTree:   ()           => api.get('/accounting/accounts/tree').then((r) => r.data ?? []),
  createAccount: (body)       => api.post('/accounting/accounts', body).then((r) => r.data),
  updateAccount: (id, body)   => api.put(`/accounting/accounts/${id}`, body).then((r) => r.data),
  removeAccount: (id)         => api.delete(`/accounting/accounts/${id}`).then((r) => r.data),
  seed:          ()           => api.post('/accounting/accounts/seed').then((r) => r.data),

  entries:       (params)     => api.get('/accounting/entries', { params }).then((r) => r.data ?? { data: [] }),
  entry:         (id)         => api.get(`/accounting/entries/${id}`).then((r) => r.data),
  createEntry:   (body)       => api.post('/accounting/entries', body).then((r) => r.data),
  reverseEntry:  (id, body={})=> api.post(`/accounting/entries/${id}/reverse`, body).then((r) => r.data),

  generalLedger: (accountId, params) => api.get(`/accounting/ledger/${accountId}`, { params }).then((r) => r.data),
  trialBalance:  (params)     => api.get('/accounting/trial-balance', { params }).then((r) => r.data ?? {}),
  profitAndLoss: (params)     => api.get('/accounting/profit-loss', { params }).then((r) => r.data ?? {}),
  balanceSheet:  (params)     => api.get('/accounting/balance-sheet', { params }).then((r) => r.data ?? {}),
};

export const approvalsApi = {
  list:         (params)     => api.get('/approvals', { params }).then((r) => r.data ?? { data: [] }),
  pendingCount: ()           => api.get('/approvals/pending-count').then((r) => r.data ?? { pending: 0 }),
  approve:      (id, note)   => api.post(`/approvals/${id}/approve`, { note }).then((r) => r.data),
  reject:       (id, note)   => api.post(`/approvals/${id}/reject`, { note }).then((r) => r.data),

  ruleOptions:  ()           => api.get('/approvals/rules/options').then((r) => r.data ?? {}),
  rules:        (params)     => api.get('/approvals/rules', { params }).then((r) => r.data ?? []),
  createRule:   (body)       => api.post('/approvals/rules', body).then((r) => r.data),
  updateRule:   (id, body)   => api.put(`/approvals/rules/${id}`, body).then((r) => r.data),
  removeRule:   (id)         => api.delete(`/approvals/rules/${id}`).then((r) => r.data),
};

export const notificationsApi = {
  // What needs attention right now, scoped to the caller's location and role.
  alerts: () => api.get('/notifications').then((r) => r.data ?? { alerts: [], counts: {} }),
  count:  () => api.get('/notifications/count').then((r) => r.data ?? {}),
  daily:  (params) => api.get('/notifications/daily', { params }).then((r) => r.data ?? {}),
};

// Cash flow and stock audit run in both modes — costs, cash and stock
// integrity are not advanced questions.
export const cashFlowApi = {
  overview: (params) => api.get('/cash-flow', { params }).then((r) => r.data ?? {}),
  summary:  (params) => api.get('/cash-flow/summary', { params }).then((r) => r.data ?? {}),
  position: (params) => api.get('/cash-flow/position', { params }).then((r) => r.data ?? {}),
  daily:    (params) => api.get('/cash-flow/daily', { params }).then((r) => r.data ?? []),
};

// Put-away, picking and packing. Bins are optional, so every one of these
// degrades to a no-op at a location that does not use them.
export const warehouseOpsApi = {
  overview:      (params)    => api.get('/warehouse-ops', { params }).then((r) => r.data ?? {}),
  occupancy:     (params)    => api.get('/warehouse-ops/occupancy', { params }).then((r) => r.data ?? {}),
  replenishment: (params)    => api.get('/warehouse-ops/replenishment', { params }).then((r) => r.data ?? {}),

  queue:         (params)    => api.get('/warehouse-ops/put-away/queue', { params }).then((r) => r.data ?? {}),
  putAwayForGrn: (grnId)     => api.get(`/warehouse-ops/put-away/grn/${grnId}`).then((r) => r.data ?? {}),
  putAway:       (body)      => api.post('/warehouse-ops/put-away', body).then((r) => r.data ?? {}),

  pickList:      (id)        => api.get(`/warehouse-ops/transfers/${id}/pick-list`).then((r) => r.data ?? {}),
  confirmPick:   (id, body)  => api.post(`/warehouse-ops/transfers/${id}/pick`, body).then((r) => r.data ?? {}),

  packages:      (id)        => api.get(`/warehouse-ops/transfers/${id}/packages`).then((r) => r.data ?? []),
  packCarton:    (id, body)  => api.post(`/warehouse-ops/transfers/${id}/packages`, body).then((r) => r.data ?? {}),
  cancelPackage: (packageId) => api.post(`/warehouse-ops/packages/${packageId}/cancel`).then((r) => r.data ?? {}),

  // Put-away rules: where each kind of product should be stored.
  rules:         (params)    => api.get('/warehouse-ops/rules', { params }).then((r) => r.data ?? {}),
  createRule:    (body)      => api.post('/warehouse-ops/rules', body).then((r) => r.data ?? {}),
  updateRule:    (id, body)  => api.put(`/warehouse-ops/rules/${id}`, body).then((r) => r.data ?? {}),
  removeRule:    (id)        => api.delete(`/warehouse-ops/rules/${id}`).then((r) => r.data ?? {}),
  whereToPut:    (productId, params) => api.get(`/warehouse-ops/where-to-put/${productId}`, { params }).then((r) => r.data ?? []),

  binContents:   (binId)     => api.get(`/warehouse-ops/bins/${binId}/contents`).then((r) => r.data ?? []),
  locate:        (productId, params) => api.get(`/warehouse-ops/locate/${productId}`, { params }).then((r) => r.data ?? []),
  move:          (body)      => api.post('/warehouse-ops/move', body).then((r) => r.data ?? {}),
  reconcile:     (params)    => api.get('/warehouse-ops/reconcile', { params }).then((r) => r.data ?? {}),
};

// Allocate, pick, pack and dispatch a sales order.
export const fulfilmentApi = {
  queue:      (params)    => api.get('/fulfilment/queue', { params }).then((r) => r.data ?? { data: [] }),
  pickList:   (id)        => api.get(`/fulfilment/${id}/pick-list`).then((r) => r.data ?? {}),
  packages:   (id)        => api.get(`/fulfilment/${id}/packages`).then((r) => r.data ?? []),
  allocate:   (id, body)  => api.post(`/fulfilment/${id}/allocate`, body).then((r) => r.data ?? {}),
  pick:       (id, body)  => api.post(`/fulfilment/${id}/pick`, body).then((r) => r.data ?? {}),
  packCarton: (id, body)  => api.post(`/fulfilment/${id}/packages`, body).then((r) => r.data ?? {}),
  dispatch:   (id, body)  => api.post(`/fulfilment/${id}/dispatch`, body).then((r) => r.data ?? {}),
  shipping:   (id, body)  => api.put(`/fulfilment/${id}/shipping`, body).then((r) => r.data ?? {}),
  cancel:     (id)        => api.post(`/fulfilment/${id}/cancel`).then((r) => r.data ?? {}),
};

export const stockAuditApi = {
  overview:       (params)     => api.get('/stock-audit', { params }).then((r) => r.data ?? {}),
  reconciliation: (params)     => api.get('/stock-audit/reconciliation', { params }).then((r) => r.data ?? {}),
  exceptions:     (params)     => api.get('/stock-audit/exceptions', { params }).then((r) => r.data ?? {}),
  location:       (id, params) => api.get(`/stock-audit/location/${id}`, { params }).then((r) => r.data ?? {}),
};

export const ledgersApi = {
  customer:    (id, params) => api.get(`/ledgers/customer/${id}`, { params }).then((r) => r.data ?? {}),
  supplier:    (id, params) => api.get(`/ledgers/supplier/${id}`, { params }).then((r) => r.data ?? {}),
  receivables: ()           => api.get('/ledgers/receivables').then((r) => r.data ?? { rows: [] }),
  payables:    ()           => api.get('/ledgers/payables').then((r) => r.data ?? { rows: [] }),
};

export const branchesApi = {
  ...makeResource('/branches'),
  productStock: (productId) => api.get(`/branches/stock/${productId}`).then((r) => r.data ?? {}),
};

/**
 * Warehouses — the 6-level location hierarchy (Warehouse → Zone → Aisle → Rack → Shelf → Bin).
 *
 * The server's /warehouses routes manage Branch rows with locationType=Warehouse
 * and their associated WarehouseBin tree.
 */
export const warehousesApi = {
  // Warehouse-level CRUD (Branch rows with locationType=Warehouse)
  list:      (params)   => api.get('/warehouses', { params }).then((r) => r.data ?? { data: [], meta: {} }),
  get:       (id)       => api.get(`/warehouses/${id}`).then((r) => r.data ?? null),
  create:    (payload)  => api.post('/warehouses', payload).then((r) => r.data ?? {}),
  update:    (id, body) => api.put(`/warehouses/${id}`, body).then((r) => r.data ?? {}),
  remove:    (id)       => api.delete(`/warehouses/${id}`).then((r) => r.data ?? {}),

  // Stock contents and valuation for a warehouse
  contents:  (id, params) => api.get(`/warehouses/${id}/contents`, { params }).then((r) => r.data ?? { data: [] }),
  valuation: (id)         => api.get(`/warehouses/${id}/valuation`).then((r) => r.data ?? {}),

  // Location hierarchy (WarehouseBin tree) within a warehouse
  bins:      (id)            => api.get(`/warehouses/${id}/bins`).then((r) => r.data ?? []),
  createBin: (id, body)      => api.post(`/warehouses/${id}/bins`, body).then((r) => r.data ?? {}),
  updateBin: (id, binId, body) => api.put(`/warehouses/${id}/bins/${binId}`, body).then((r) => r.data ?? {}),
  removeBin: (id, binId)     => api.delete(`/warehouses/${id}/bins/${binId}`).then((r) => r.data ?? {}),
};
