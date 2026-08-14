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
export const productsApi      = makeResource('/products');
export const unitsApi         = makeMasterDataResource('unit');
export const suppliersApi     = makeResource('/suppliers');
export const purchasesApi     = makeResource('/purchases');
export const invoicesApi      = makeResource('/invoices');
export const salesOrdersApi   = makeResource('/sales-orders');
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

export const purchaseReturnsApi = withAction('/purchase-returns', {
  returnable: (purchaseId) => api.get(`/purchase-returns/returnable/${purchaseId}`).then((r) => r.data),
  confirm:    (id)         => api.post(`/purchase-returns/${id}/confirm`).then((r) => r.data),
  cancel:     (id)         => api.post(`/purchase-returns/${id}/cancel`).then((r) => r.data),
});

export const warehousesApi = withAction('/warehouses', {
  contents:  (id, params) => api.get(`/warehouses/${id}/contents`, { params }).then((r) => r.data),
  valuation: (id)         => api.get(`/warehouses/${id}/valuation`).then((r) => r.data),
  bins:      (id)         => api.get(`/warehouses/${id}/bins`).then((r) => r.data ?? []),
  createBin: (id, body)   => api.post(`/warehouses/${id}/bins`, body).then((r) => r.data),
  removeBin: (id, binId)  => api.delete(`/warehouses/${id}/bins/${binId}`).then((r) => r.data),
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
