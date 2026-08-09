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
  get: () => api.get('/dashboard').then((r) => r.data ?? {}),
  productPerformance: (params) =>
    api.get('/dashboard/product-performance', { params }).then((r) => r.data ?? {}),
};

export const reportsApi = {
  sales:     (params) => api.get('/reports/sales', { params }).then((r) => r.data ?? []),
  gst:       (params) => api.get('/reports/gst', { params }).then((r) => r.data ?? []),
  customers: ()       => api.get('/reports/customers').then((r) => r.data ?? []),
  products:  ()       => api.get('/reports/products').then((r) => r.data ?? []),
  inventory: ()       => api.get('/reports/inventory').then((r) => r.data ?? []),
  export:    (type)   => api.get(`/reports/export/${type}`, { responseType: 'blob' }).then((r) => r.data),
};

export const settingsApi = {
  get:         ()       => api.get('/settings').then((r) => r.data ?? {}),
  saveCompany: (payload)=> api.put('/settings/company', payload).then((r) => r.data ?? {}),
};
