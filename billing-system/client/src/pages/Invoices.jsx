import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import EmailIcon from '@mui/icons-material/Email';
import PrintIcon from '@mui/icons-material/Print';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ShareIcon from '@mui/icons-material/Share';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import {
  alpha, Box, Button, Chip, Divider, Grid, IconButton,
  Menu, MenuItem, Paper, Stack, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../services/api.js';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { customersApi, invoicesApi, productsApi } from '../services/resource.service.js';
import { currency, date } from '../utils/formatters.js';

const blankItem = { productId: '', quantity: 1, rate: 0, discount: 0, gstPercent: 18 };

function calculate(items) {
  const subtotal = items.reduce((sum, it) => sum + Math.max(Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount || 0), 0), 0);
  const tax = items.reduce((sum, it) => {
    const taxable = Math.max(Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount || 0), 0);
    return sum + taxable * Number(it.gstPercent || 0) / 100;
  }, 0);
  const grand = Math.round(subtotal + tax);
  return { subtotal, cgst: tax / 2, sgst: tax / 2, igst: 0, grand, roundOff: grand - subtotal - tax };
}

function lineTotal(item) {
  const taxable = Math.max(Number(item.quantity || 0) * Number(item.rate || 0) - Number(item.discount || 0), 0);
  return taxable + taxable * Number(item.gstPercent || 0) / 100;
}

function PaymentChip({ method }) {
  const colors = { Cash: 'success', Card: 'info', UPI: 'primary', 'Bank Transfer': 'secondary', Credit: 'warning' };
  return <Chip label={method || 'Cash'} size="small" color={colors[method] || 'default'} variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
}

function DownloadMenu({ id }) {
  const [anchor, setAnchor] = useState(null);
  const download = async (template) => {
    setAnchor(null);
    const blob = await api.get(`/invoices/${id}/pdf?template=${template}`, { responseType: 'blob' }).then((r) => r.data);
    window.open(URL.createObjectURL(blob), '_blank');
  };
  return (
    <>
      <Tooltip title="Download PDF">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ borderRadius: 1.5 }}>
          <DownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {[['', 'Default'], ['standard', 'Standard'], ['modern', 'Modern'], ['compact', 'Compact'], ['premium', 'Premium'], ['thermal', 'Thermal (80mm)']].map(([t, l]) => (
          <MenuItem key={t} onClick={() => download(t)} sx={{ fontSize: '0.85rem' }}>{l}</MenuItem>
        ))}
      </Menu>
    </>
  );
}

function ShareMenu({ row }) {
  const [anchor, setAnchor] = useState(null);
  const share = (method) => {
    setAnchor(null);
    const text = `Hello ${row.Customer?.customerName}, here is Invoice ${row.invoiceNumber} for ${currency(row.grandTotal)}.`;
    if (method === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    else window.location.href = `mailto:?subject=Invoice ${row.invoiceNumber}&body=${encodeURIComponent(text)}`;
  };
  return (
    <>
      <Tooltip title="Share">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ borderRadius: 1.5 }}>
          <ShareIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => share('whatsapp')}><WhatsAppIcon sx={{ mr: 1, color: '#25D366', fontSize: 18 }} />WhatsApp</MenuItem>
        <MenuItem onClick={() => share('email')}><EmailIcon sx={{ mr: 1, color: '#EA4335', fontSize: 18 }} />Email</MenuItem>
      </Menu>
    </>
  );
}

export default function Invoices() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([blankItem]);
  const { showToast } = useToast();
  const theme = useTheme();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { invoiceDate: new Date().toISOString().slice(0, 10), customerId: '', paymentMethod: 'Cash', notes: '' },
  });
  const totals = useMemo(() => calculate(items), [items]);

  const load = async () => {
    setLoading(true);
    try {
      const [result, cr, pr] = await Promise.all([
        invoicesApi.list(query),
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
    if (!selected.length) { showToast('Add at least one product', 'error'); return; }
    const oversold = selected.find((it) => {
      const p = products.find((p) => p.id === Number(it.productId));
      return p && Number(it.quantity) > Number(p.stock || 0);
    });
    if (oversold) {
      const p = products.find((p) => p.id === Number(oversold.productId));
      showToast(`${p.productName} only has ${p.stock} in stock`, 'error'); return;
    }
    try {
      await invoicesApi.create({ ...values, items: selected });
      showToast('Invoice saved');
      setOpen(false); setItems([blankItem]); reset(); load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed to save invoice', 'error'); }
  };

  const cancelInvoice = async (id) => {
    if (!window.confirm('Cancel this invoice? Stock will be reversed.')) return;
    try { await api.delete(`/invoices/${id}`); showToast('Invoice cancelled'); load(); }
    catch { showToast('Failed to cancel invoice', 'error'); }
  };

  // Summary stats
  const stats = useMemo(() => ({
    total: rows.length,
    revenue: rows.reduce((s, r) => s + Number(r.grandTotal || 0), 0),
    paid: rows.filter((r) => r.paymentMethod !== 'Credit').length,
    pending: rows.filter((r) => r.paymentMethod === 'Credit').length,
  }), [rows]);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Invoices"
        subtitle="Create and manage GST billing invoices"
        icon={<ReceiptIcon />}
        action={
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
            New Invoice
          </Button>
        }
      />

      {/* Stats */}
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatsCard title="Total Invoices" value={meta.total || stats.total} detail="All time" icon={<ReceiptIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Revenue" value={currency(stats.revenue)} detail="This page" icon={<ReceiptIcon />} gradient="success" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Paid" value={stats.paid} detail="This page" icon={<ReceiptIcon />} gradient="info" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Credit Pending" value={stats.pending} detail="This page" icon={<ReceiptIcon />} gradient="warning" />
        </Grid>
      </Grid>

      {/* Table */}
      {loading ? <Loader /> : (
        <>
          <DataTable
            mobileKeyField="invoiceNumber"
            columns={[
              { field: 'invoiceNumber', headerName: 'Invoice #', render: (row) => <Typography fontWeight={700} color="primary.main">{row.invoiceNumber}</Typography> },
              { field: 'invoiceDate', headerName: 'Date', render: (row) => date(row.invoiceDate) },
              { field: 'customer', headerName: 'Customer', render: (row) => row.Customer?.customerName },
              { field: 'paymentMethod', headerName: 'Payment', render: (row) => <PaymentChip method={row.paymentMethod} /> },
              { field: 'grandTotal', headerName: 'Amount', render: (row) => (
                <Typography fontWeight={800} color="success.main">{currency(row.grandTotal)}</Typography>
              )},
              { field: 'actions', headerName: 'Actions', render: (row) => (
                <Stack direction="row" spacing={0.25}>
                  <DownloadMenu id={row.id} />
                  <Tooltip title="Print"><IconButton size="small" onClick={() => window.print()} sx={{ borderRadius: 1.5 }}><PrintIcon fontSize="small" /></IconButton></Tooltip>
                  <ShareMenu row={row} />
                  <Tooltip title="Cancel Invoice"><IconButton size="small" color="error" onClick={() => cancelInvoice(row.id)} sx={{ borderRadius: 1.5 }}><CancelIcon fontSize="small" /></IconButton></Tooltip>
                </Stack>
              )},
            ]}
            rows={rows}
          />
          <Pagination meta={meta} onChangePage={(p) => setQuery({ ...query, page: p })} onChangeLimit={(l) => setQuery({ ...query, limit: l })} />
        </>
      )}

      {/* Create Invoice Modal */}
      <Modal open={open} title="Create New Invoice" onClose={() => setOpen(false)} maxWidth="lg">
        <Stack spacing={3} component="form" onSubmit={handleSubmit(submit)}>
          {/* Header fields */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth type="date" label="Invoice Date" InputLabelProps={{ shrink: true }} {...register('invoiceDate', { required: true })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Customer" {...register('customerId', { required: true })}>
                {customers.map((c) => <MenuItem value={c.id} key={c.id}>{c.customerName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Payment Method" {...register('paymentMethod')}>
                {['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit'].map((m) => <MenuItem value={m} key={m}>{m}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>

          {/* Line Items */}
          <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.04), borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700}>Line Items</Typography>
            </Box>
            <Stack spacing={1.5} sx={{ p: 2 }}>
              {items.map((item, index) => (
                <Box key={index}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} md={4}>
                      <TextField fullWidth select size="small" label="Product" value={item.productId} onChange={(e) => chooseProduct(index, e.target.value)}>
                        {products.map((p) => (
                          <MenuItem value={p.id} key={p.id} disabled={Number(p.stock || 0) <= 0}>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>{p.productName}</Typography>
                              <Typography variant="caption" color="text.secondary">Stock: {p.stock} • HSN: {p.hsnCode}</Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    {[['quantity', 'Qty'], ['rate', 'Rate'], ['discount', 'Disc.'], ['gstPercent', 'GST%']].map(([name, label]) => (
                      <Grid item xs={6} sm={3} md={1.5} key={name}>
                        <TextField fullWidth size="small" type="number" label={label} value={item[name]} onChange={(e) => setItem(index, { [name]: e.target.value })} />
                      </Grid>
                    ))}
                    <Grid item xs={6} sm={3} md={1.5}>
                      <Box sx={{ px: 1.5, py: 0.75, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.08), textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" display="block">Total</Typography>
                        <Typography fontWeight={700} color="primary.main" fontSize="0.85rem">{currency(lineTotal(item))}</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={3} md={0.5}>
                      <IconButton size="small" color="error" onClick={() => setItems(items.filter((_, i) => i !== index))} disabled={items.length === 1}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Grid>
                  </Grid>
                  {index < items.length - 1 && <Divider sx={{ mt: 1.5 }} />}
                </Box>
              ))}
              <Button startIcon={<AddIcon />} onClick={() => setItems([...items, blankItem])} sx={{ alignSelf: 'flex-start' }}>
                Add Product
              </Button>
            </Stack>
          </Paper>

          {/* Totals + Notes */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth multiline minRows={3} label="Notes / Terms" {...register('notes')} />
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Stack spacing={0.75}>
                  {[['Subtotal', currency(totals.subtotal)], ['CGST', currency(totals.cgst)], ['SGST', currency(totals.sgst)], ['IGST', currency(totals.igst)], ['Round Off', currency(totals.roundOff)]].map(([l, v]) => (
                    <Stack key={l} direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">{l}</Typography>
                      <Typography variant="body2" fontWeight={500}>{v}</Typography>
                    </Stack>
                  ))}
                  <Divider sx={{ my: 0.5 }} />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography fontWeight={800} fontSize="1rem">Grand Total</Typography>
                    <Typography fontWeight={800} fontSize="1.1rem" color="primary.main">{currency(totals.grand)}</Typography>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          {/* Actions */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button onClick={() => setOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button onClick={() => window.print()} startIcon={<PrintIcon />} variant="outlined" sx={{ borderRadius: 2 }}>Print</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2, minWidth: 140 }}>
              {isSubmitting ? 'Saving…' : 'Save Invoice'}
            </Button>
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
