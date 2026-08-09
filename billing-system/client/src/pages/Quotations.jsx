import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import ShareIcon from '@mui/icons-material/Share';
import {
  Box, Button, Chip, Grid, IconButton, MenuItem, Paper,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import LineItems from '../components/LineItems.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import PeriodFilter from '../components/PeriodFilter.jsx';
import SearchBox from '../components/SearchBox.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { customersApi, productsApi, quotationsApi } from '../services/resource.service.js';
import api from '../services/api.js';
import { currency, date } from '../utils/formatters.js';
import { printHtml } from '../utils/print.js';

const blankItem = { productId: '', quantity: 1, rate: 0, discount: 0, gstPercent: 18 };
const STATUS_COLORS = { Draft: 'default', Sent: 'info', Accepted: 'success', Rejected: 'error' };

function calc(items) {
  const subtotal = items.reduce((sum, it) => sum + Math.max(Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount || 0), 0), 0);
  const tax = items.reduce((sum, it) => {
    const taxable = Math.max(Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount || 0), 0);
    return sum + taxable * Number(it.gstPercent || 0) / 100;
  }, 0);
  return { subtotal, tax, grand: Math.round(subtotal + tax) };
}

export default function Quotations() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '' , period: 'all', from: '', to: '', month: '' });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([blankItem]);
  const [deleting, setDeleting] = useState(null);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { quotationDate: new Date().toISOString().slice(0, 10), validUntil: '', customerId: '', status: 'Draft', notes: '' },
  });
  const totals = useMemo(() => calc(items), [items]);

  const load = async () => {
    setLoading(true);
    try {
      const [result, cr, pr] = await Promise.all([
        quotationsApi.list(query),
        customersApi.list({ limit: 200 }),
        productsApi.list({ limit: 200 }),
      ]);
      setRows(result?.data || []); setMeta(result?.meta || {});
      setCustomers(cr?.data || []); setProducts(pr?.data || []);
    } catch {
      setRows([]); setMeta({}); setCustomers([]); setProducts([]);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const submit = async (values) => {
    const selected = items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (!selected.length) { showToast('Add at least one product', 'error'); return; }
    try {
      await quotationsApi.create({ ...values, items: selected, totalAmount: totals.grand });
      showToast('Quotation saved');
      setOpen(false); setItems([blankItem]); reset(); load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error saving quotation', 'error');
    }
  };

  const remove = async () => {
    try {
      await quotationsApi.remove(deleting.id);
      showToast('Quotation deleted');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to delete quotation', 'error');
    }
    setDeleting(null);
    load();
  };

  const quotationPdf = (id) => api.get(`/quotations/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data);

  const download = async (id) => {
    try {
      window.open(URL.createObjectURL(await quotationPdf(id)), '_blank');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to download quotation', 'error');
    }
  };

  // Prints the designed HTML layout rather than the surrounding page.
  const print = async (id) => {
    try {
      printHtml(await api.get(`/quotations/${id}/html`, { responseType: 'text' }).then((r) => r.data));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to print quotation', 'error');
    }
  };

  const share = (quotation) => {
    const text = `Hello ${quotation.Customer?.customerName || ''}, here is Quotation ${quotation.quotationNumber} for ${currency(quotation.totalAmount)}.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const stats = useMemo(() => ({
    count: meta.total || rows.length,
    accepted: rows.filter((r) => r.status === 'Accepted').length,
    value: rows.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0),
  }), [rows, meta]);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Quotations"
        subtitle="Prepare and track price quotes before they become orders"
        icon={<RequestQuoteIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <SearchBox value={query.search} onChange={(search) => setQuery({ ...query, search, page: 1 })} placeholder="Search quotations…" />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
              New Quotation
            </Button>
          </Stack>
        }
      />

      <PeriodFilter
        value={query}
        onChange={(range) => setQuery({ ...query, ...range, page: 1 })}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} md={4}>
          <StatsCard title="Total Quotations" value={stats.count} detail="All quotes" icon={<RequestQuoteIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={4}>
          <StatsCard title="Accepted" value={stats.accepted} detail="This page" icon={<RequestQuoteIcon />} gradient="success" />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatsCard title="Quoted Value" value={currency(stats.value)} detail="This page" icon={<RequestQuoteIcon />} gradient="info" />
        </Grid>
      </Grid>

      {loading && rows.length === 0 ? <Loader /> : (
        <Box sx={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
        <>
          <DataTable
            mobileKeyField="quotationNumber"
            columns={[
              { field: 'quotationNumber', headerName: 'Quote #', render: (r) => <Typography fontWeight={700} color="primary.main">{r.quotationNumber}</Typography> },
              { field: 'quotationDate', headerName: 'Date', render: (r) => date(r.quotationDate) },
              { field: 'customer', headerName: 'Customer', render: (r) => r.Customer?.customerName || '—' },
              { field: 'validUntil', headerName: 'Valid Until', render: (r) => (r.validUntil ? date(r.validUntil) : '—') },
              { field: 'status', headerName: 'Status', render: (r) => <Chip label={r.status} size="small" color={STATUS_COLORS[r.status] || 'default'} sx={{ fontWeight: 700, fontSize: '0.7rem' }} /> },
              { field: 'totalAmount', headerName: 'Total', render: (r) => <Typography fontWeight={800} color="success.main">{currency(r.totalAmount)}</Typography> },
              { field: 'actions', headerName: 'Actions', render: (r) => (
                <Stack direction="row" spacing={0.25}>
                  <Tooltip title="Download PDF">
                    <IconButton size="small" onClick={() => download(r.id)} sx={{ borderRadius: 1.5 }}><DownloadIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Print">
                    <IconButton size="small" onClick={() => print(r.id)} sx={{ borderRadius: 1.5 }}><PrintIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Share on WhatsApp">
                    <IconButton size="small" onClick={() => share(r)} sx={{ borderRadius: 1.5 }}><ShareIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleting(r)} sx={{ borderRadius: 1.5 }}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
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

      <Modal open={open} title="New Quotation" onClose={() => setOpen(false)} maxWidth="lg">
        <Stack spacing={2.5} component="form" onSubmit={handleSubmit(submit)}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={3}>
              <TextField select fullWidth label="Customer" defaultValue="" {...register('customerId', { required: true })} InputLabelProps={{ shrink: true }}>
                <MenuItem value=""><em>Select customer</em></MenuItem>
                {customers.map((c) => <MenuItem key={c.id} value={c.id}>{c.customerName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth type="date" label="Quotation Date" {...register('quotationDate')} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth type="date" label="Valid Until" {...register('validUntil')} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField select fullWidth label="Status" defaultValue="Draft" {...register('status')} InputLabelProps={{ shrink: true }}>
                {['Draft', 'Sent', 'Accepted', 'Rejected'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>

          <LineItems items={items} onChange={setItems} products={products} blank={blankItem} />

          <Grid container spacing={2}>
            <Grid item xs={12} md={7}>
              <TextField fullWidth label="Notes" multiline minRows={3} {...register('notes')} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                    <Typography variant="body2" fontWeight={500}>{currency(totals.subtotal)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">GST</Typography>
                    <Typography variant="body2" fontWeight={500}>{currency(totals.tax)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Typography fontWeight={800}>Grand Total</Typography>
                    <Typography fontWeight={800} color="primary.main">{currency(totals.grand)}</Typography>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button type="button" onClick={() => setOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2, minWidth: 140 }}>
              {isSubmitting ? 'Saving…' : 'Save Quotation'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Quotation"
        message={`Are you sure you want to delete "${deleting?.quotationNumber}"?`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
