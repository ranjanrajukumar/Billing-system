import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import ShareIcon from '@mui/icons-material/Share';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import InventoryIcon from '@mui/icons-material/Inventory';
import {
  alpha, Box, Button, Chip, Divider, Grid, IconButton,
  MenuItem, Paper, Stack, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import api from '../services/api.js';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import PeriodFilter from '../components/PeriodFilter.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { customersApi, salesOrdersApi, productsApi } from '../services/resource.service.js';
import SearchableSelect from '../components/SearchableSelect.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { currency, date } from '../utils/formatters.js';
import { printDocument, printPdfBlob } from '../utils/print.js';

const blankItem = { productId: '', quantity: 1, rate: 0, discount: 0, gstPercent: 18 };

function calc(items) {
  const sub = items.reduce((s, it) => s + Math.max(Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount || 0), 0), 0);
  const tax = items.reduce((s, it) => {
    const t = Math.max(Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount || 0), 0);
    return s + t * Number(it.gstPercent || 0) / 100;
  }, 0);
  const grand = Math.round(sub + tax);
  return { subtotal: sub, cgst: tax / 2, sgst: tax / 2, igst: 0, grand, roundOff: grand - sub - tax };
}

const STATUS_COLORS = { Pending: 'warning', Approved: 'info', Confirmed: 'success', Shipped: 'primary', Delivered: 'success', Cancelled: 'error' };

export default function SalesOrders() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10 , period: 'all', from: '', to: '', month: '' });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([blankItem]);
  const { showToast } = useToast();
  const theme = useTheme();
  const { register, handleSubmit, reset, control, formState: { isSubmitting } } = useForm({
    defaultValues: { orderDate: new Date().toISOString().slice(0, 10), customerId: '', status: 'Pending', notes: '' },
  });
  const totals = useMemo(() => calc(items), [items]);

  const load = async () => {
    setLoading(true);
    try {
      const [result, cr, pr] = await Promise.all([
        salesOrdersApi.list(query),
        customersApi.list({ limit: 200 }),
        productsApi.list({ limit: 200 }),
      ]);
      setRows(result?.data || []); setMeta(result?.meta || {});
      setCustomers(cr?.data || []); setProducts(pr?.data || []);
    } catch {
      setRows([]); setMeta({});
      setCustomers([]); setProducts([]);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const setItem = (i, patch) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const chooseProduct = (i, productId) => {
    const p = products.find((p) => p.id === Number(productId));
    setItem(i, { productId, rate: p?.sellingPrice || 0, gstPercent: p?.gstPercent || 0 });
  };

  const submit = async (values) => {
    const selected = items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (!selected.length) { showToast('Add at least one product with quantity > 0', 'error'); return; }
    const invalid = selected.find(it => Number(it.rate) < 0 || Number(it.discount) < 0 || Number(it.gstPercent) < 0 || Number(it.gstPercent) > 100);
    if (invalid) { showToast('Invalid rate, discount, or GST percentage in line items', 'error'); return; }
    try {
      await salesOrdersApi.create({ ...values, items: selected, totalAmount: totals.grand });
      showToast('Sales Order saved');
      setOpen(false); setItems([blankItem]); reset(); load();
    } catch (err) { showToast(err.response?.data?.message || 'Error saving order', 'error'); }
  };

  /** Confirm order → reserves stock. Shows insufficient-stock error prominently. */
  const confirmOrder = async (order) => {
    try {
      await salesOrdersApi.confirm(order.id);
      showToast(`Order ${order.orderNumber} confirmed — stock reserved`, 'success');
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not confirm order';
      showToast(msg, 'error');
    }
  };

  /** Cancel order → releases any stock reservation. */
  const cancelOrder = async (order) => {
    try {
      await salesOrdersApi.cancel(order.id);
      showToast(`Order ${order.orderNumber} cancelled`, 'info');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not cancel order', 'error');
    }
  };

  const orderPdf = (id) => api.get(`/sales-orders/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data);

  const download = async (id) => {
    try {
      window.open(URL.createObjectURL(await orderPdf(id)), '_blank');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to download PDF', 'error');
    }
  };

  // Print the generated order PDF rather than the surrounding page.
  const printOrder = async (id) => {
    try {
      printPdfBlob(await orderPdf(id));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to print order', 'error');
    }
  };

  const share = (order) => {
    const text = `Hello ${order.Customer?.customerName || ''}, here is Sales Order ${order.orderNumber} for ${currency(order.totalAmount)}.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  // The order being composed has no PDF yet, so print its line items directly.
  const printDraft = () => {
    const selected = items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (!selected.length) {
      showToast('Add at least one product before printing', 'error');
      return;
    }
    const productName = (id) => products.find((p) => String(p.id) === String(id))?.productName || '—';
    const amount = (it) => {
      const taxable = Math.max(Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount || 0), 0);
      return taxable + taxable * Number(it.gstPercent || 0) / 100;
    };
    printDocument({
      title: 'Sales Order Draft',
      subtitle: `Prepared ${date(new Date())}`,
      columns: [
        { header: 'Product', value: (it) => productName(it.productId) },
        { header: 'Qty', value: (it) => it.quantity, numeric: true },
        { header: 'Rate', value: (it) => currency(it.rate), numeric: true },
        { header: 'Discount', value: (it) => currency(it.discount), numeric: true },
        { header: 'GST %', value: (it) => `${Number(it.gstPercent || 0)}%`, numeric: true },
        { header: 'Amount', value: (it) => currency(amount(it)), numeric: true },
      ],
      rows: selected,
      summary: [
        { label: 'Subtotal', value: currency(totals.subtotal) },
        { label: 'CGST', value: currency(totals.cgst) },
        { label: 'SGST', value: currency(totals.sgst) },
        { label: 'Round Off', value: currency(totals.roundOff) },
        { label: 'Grand Total', value: currency(totals.grand), total: true },
      ],
    });
  };

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((r) => r.status === 'Pending').length,
    delivered: rows.filter((r) => r.status === 'Delivered').length,
    value: rows.reduce((s, r) => s + Number(r.totalAmount || 0), 0),
  }), [rows]);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Sales Orders"
        subtitle="Create and track sales orders before invoicing"
        icon={<ShoppingCartIcon />}
        action={
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
            New Order
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <PeriodFilter
          value={query}
          onChange={(range) => setQuery({ ...query, ...range, page: 1 })}
        />
        <SearchBox value={query.search || ''} onChange={(search) => setQuery({ ...query, search, page: 1 })} placeholder="Search orders…" />
        <TextField
          select size="small" label="Status" value={query.status || ''}
          onChange={(e) => setQuery({ ...query, status: e.target.value, page: 1 })}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All Statuses</MenuItem>
          {Object.keys(STATUS_COLORS).map((s) => <MenuItem value={s} key={s}>{s}</MenuItem>)}
        </TextField>
      </Stack>

      {/* Stats */}
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatsCard title="Total Orders" value={meta.total || stats.total} detail="All orders" icon={<ShoppingCartIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Pending" value={stats.pending} detail="Awaiting action" icon={<ShoppingCartIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Delivered" value={stats.delivered} detail="Completed" icon={<ShoppingCartIcon />} gradient="success" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Order Value" value={currency(stats.value)} detail="This page" icon={<ShoppingCartIcon />} gradient="info" />
        </Grid>
      </Grid>

      {/* Table */}
      {loading && rows.length === 0 ? <Loader /> : (
        <Box sx={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
        <>
          <DataTable
            mobileKeyField="orderNumber"
            columns={[
              { field: 'orderNumber', headerName: 'Order #', render: (r) => <Typography fontWeight={700} color="primary.main">{r.orderNumber}</Typography> },
              { field: 'orderDate', headerName: 'Date', render: (r) => date(r.orderDate) },
              { field: 'customer', headerName: 'Customer', render: (r) => r.Customer?.customerName },
              { field: 'status', headerName: 'Status', render: (r) => <Chip label={r.status} size="small" color={STATUS_COLORS[r.status] || 'default'} sx={{ fontWeight: 700, fontSize: '0.7rem' }} /> },
              { field: 'totalAmount', headerName: 'Total', render: (r) => <Typography fontWeight={800} color="success.main">{currency(r.totalAmount)}</Typography> },
              { field: 'actions', headerName: 'Actions', render: (r) => (
                <Stack direction="row" spacing={0.25}>
                  {/* Confirm — only for Pending/Approved orders */}
                  {!['Confirmed', 'Cancelled', 'Delivered', 'Shipped'].includes(r.status) && (
                    <Tooltip title="Confirm Order &amp; Reserve Stock">
                      <IconButton size="small" color="success" onClick={() => confirmOrder(r)} sx={{ borderRadius: 1.5 }}>
                        <CheckCircleIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {/* Cancel — not for already-cancelled or delivered */}
                  {!['Cancelled', 'Delivered'].includes(r.status) && (
                    <Tooltip title="Cancel Order">
                      <IconButton size="small" color="error" onClick={() => cancelOrder(r)} sx={{ borderRadius: 1.5 }}>
                        <CancelIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Download PDF"><IconButton size="small" onClick={() => download(r.id)} sx={{ borderRadius: 1.5 }}><DownloadIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Print"><IconButton size="small" onClick={() => printOrder(r.id)} sx={{ borderRadius: 1.5 }}><PrintIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Share on WhatsApp"><IconButton size="small" onClick={() => share(r)} sx={{ borderRadius: 1.5 }}><ShareIcon fontSize="small" /></IconButton></Tooltip>
                </Stack>
              )},
            ]}
            rows={rows}
            meta={meta}
          />
          <Pagination meta={meta} onChangePage={(p) => setQuery({ ...query, page: p })} onChangeLimit={(l) => setQuery({ ...query, limit: l })} />
        </>
        </Box>
      )}

      {/* Create Modal */}
      <Modal open={open} title="New Sales Order" onClose={() => setOpen(false)} maxWidth="lg">
        <Stack spacing={3} component="form" onSubmit={handleSubmit(submit)}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth type="date" label="Order Date" InputLabelProps={{ shrink: true }} {...register('orderDate', { required: true })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Controller
                name="customerId"
                control={control}
                rules={{ required: true }}
                render={({ field: { onChange, value } }) => (
                  <SearchableSelect
                    options={customers}
                    label="Customer"
                    value={customers.find(c => String(c.id) === String(value)) || null}
                    onChange={(selected) => onChange(selected ? selected.id : '')}
                    getOptionLabel={(c) => c.customerName}
                    getOptionKey={(c) => c.id}
                    required
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Status" {...register('status')}>
                {Object.keys(STATUS_COLORS).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>

          {/* Line items */}
          <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.04), borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700}>Line Items</Typography>
            </Box>
            <Stack spacing={1.5} sx={{ p: 2 }}>
              {items.map((item, i) => (
                <Box key={i}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} md={4}>
                      <SearchableSelect
                        options={products}
                        label="Product"
                        size="small"
                        value={products.find(p => String(p.id) === String(item.productId)) || null}
                        onChange={(selected) => chooseProduct(i, selected ? selected.id : '')}
                        getOptionLabel={(p) => p.productName}
                        getOptionKey={(p) => p.id}
                      />
                    </Grid>
                    {[['quantity', 'Qty'], ['rate', 'Rate'], ['discount', 'Disc.'], ['gstPercent', 'GST%']].map(([name, label]) => (
                      <Grid item xs={6} sm={3} md={1.5} key={name}>
                        <TextField fullWidth size="small" type="number" label={label} value={item[name]} onChange={(e) => setItem(i, { [name]: e.target.value })} />
                      </Grid>
                    ))}
                    <Grid item xs={6} sm={3} md={0.5}>
                      <IconButton type="button" size="small" color="error" onClick={() => setItems(items.filter((_, idx) => idx !== i))} disabled={items.length === 1}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Grid>
                  </Grid>
                  {i < items.length - 1 && <Divider sx={{ mt: 1.5 }} />}
                </Box>
              ))}
              <Button type="button" startIcon={<AddIcon />} onClick={() => setItems([...items, blankItem])} sx={{ alignSelf: 'flex-start' }}>Add Product</Button>
            </Stack>
          </Paper>

          {/* Totals */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth multiline minRows={3} label="Notes" {...register('notes')} />
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Stack spacing={0.75}>
                  {[['Subtotal', totals.subtotal], ['CGST', totals.cgst], ['SGST', totals.sgst], ['IGST', totals.igst], ['Round Off', totals.roundOff]].map(([l, v]) => (
                    <Stack key={l} direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">{l}</Typography>
                      <Typography variant="body2" fontWeight={500}>{currency(v)}</Typography>
                    </Stack>
                  ))}
                  <Divider sx={{ my: 0.5 }} />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography fontWeight={800}>Grand Total</Typography>
                    <Typography fontWeight={800} color="primary.main">{currency(totals.grand)}</Typography>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button type="button" onClick={() => setOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button type="button" onClick={printDraft} startIcon={<PrintIcon />} variant="outlined" sx={{ borderRadius: 2 }}>Print</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2 }}>
              {isSubmitting ? 'Saving…' : 'Save Order'}
            </Button>
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
