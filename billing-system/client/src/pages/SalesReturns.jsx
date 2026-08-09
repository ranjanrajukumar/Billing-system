import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn';
import PrintIcon from '@mui/icons-material/Print';
import {
  Button, Chip, Grid, IconButton, MenuItem, Paper,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../services/api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import LineItems from '../components/LineItems.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import SearchBox from '../components/SearchBox.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { customersApi, invoicesApi, productsApi, salesReturnsApi } from '../services/resource.service.js';
import { currency, date } from '../utils/formatters.js';
import { printPdfBlob } from '../utils/print.js';

const blankItem = { productId: '', quantity: 1, rate: 0 };
const STATUS_COLORS = { Pending: 'warning', Completed: 'success', Rejected: 'error' };

export default function SalesReturns() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '' });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [items, setItems] = useState([blankItem]);
  const [deleting, setDeleting] = useState(null);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { returnDate: new Date().toISOString().slice(0, 10), customerId: '', invoiceId: '', status: 'Pending', reason: '' },
  });

  const totalRefund = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.rate || 0), 0),
    [items],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [result, cr, pr, ir] = await Promise.all([
        salesReturnsApi.list(query),
        customersApi.list({ limit: 200 }),
        productsApi.list({ limit: 200 }),
        invoicesApi.list({ limit: 200 }),
      ]);
      setRows(result?.data || []); setMeta(result?.meta || {});
      setCustomers(cr?.data || []); setProducts(pr?.data || []); setInvoices(ir?.data || []);
    } catch {
      setRows([]); setMeta({}); setCustomers([]); setProducts([]); setInvoices([]);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const submit = async (values) => {
    const selected = items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (!selected.length) { showToast('Add at least one product', 'error'); return; }
    try {
      const payload = { ...values, items: selected, totalRefund };
      if (!payload.invoiceId) delete payload.invoiceId;
      await salesReturnsApi.create(payload);
      showToast('Sales return saved and stock restored');
      setOpen(false); setItems([blankItem]); reset(); load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error saving return', 'error');
    }
  };

  const remove = async () => {
    try {
      await salesReturnsApi.remove(deleting.id);
      showToast('Sales return deleted');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to delete return', 'error');
    }
    setDeleting(null);
    load();
  };

  const creditNote = (id) => api.get(`/sales-returns/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data);

  const download = async (id) => {
    try {
      window.open(URL.createObjectURL(await creditNote(id)), '_blank');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to download credit note', 'error');
    }
  };

  const print = async (id) => {
    try {
      printPdfBlob(await creditNote(id));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to print credit note', 'error');
    }
  };

  const stats = useMemo(() => ({
    count: meta.total || rows.length,
    pending: rows.filter((r) => r.status === 'Pending').length,
    refunded: rows.reduce((sum, r) => sum + Number(r.totalRefund || 0), 0),
  }), [rows, meta]);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Sales Returns"
        subtitle="Process customer returns, restore stock and issue credit notes"
        icon={<KeyboardReturnIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <SearchBox value={query.search} onChange={(search) => setQuery({ ...query, search, page: 1 })} placeholder="Search returns…" />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
              New Return
            </Button>
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={6} md={4}>
          <StatsCard title="Total Returns" value={stats.count} detail="All returns" icon={<KeyboardReturnIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={4}>
          <StatsCard title="Pending" value={stats.pending} detail="Awaiting action" icon={<KeyboardReturnIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatsCard title="Refunded" value={currency(stats.refunded)} detail="This page" icon={<KeyboardReturnIcon />} gradient="error" />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <>
          <DataTable
            mobileKeyField="returnNumber"
            columns={[
              { field: 'returnNumber', headerName: 'Return #', render: (r) => <Typography fontWeight={700} color="primary.main">{r.returnNumber}</Typography> },
              { field: 'returnDate', headerName: 'Date', render: (r) => date(r.returnDate) },
              { field: 'customer', headerName: 'Customer', render: (r) => r.Customer?.customerName || '—' },
              { field: 'reason', headerName: 'Reason', render: (r) => r.reason || '—' },
              { field: 'status', headerName: 'Status', render: (r) => <Chip label={r.status} size="small" color={STATUS_COLORS[r.status] || 'default'} sx={{ fontWeight: 700, fontSize: '0.7rem' }} /> },
              { field: 'totalRefund', headerName: 'Refund', render: (r) => <Typography fontWeight={800} color="error.main">{currency(r.totalRefund)}</Typography> },
              { field: 'actions', headerName: 'Actions', render: (r) => (
                <Stack direction="row" spacing={0.25}>
                  <Tooltip title="Download credit note">
                    <IconButton size="small" onClick={() => download(r.id)} sx={{ borderRadius: 1.5 }}><DownloadIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Print credit note">
                    <IconButton size="small" onClick={() => print(r.id)} sx={{ borderRadius: 1.5 }}><PrintIcon fontSize="small" /></IconButton>
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
      )}

      <Modal open={open} title="New Sales Return" onClose={() => setOpen(false)} maxWidth="lg">
        <Stack spacing={2.5} component="form" onSubmit={handleSubmit(submit)}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={3}>
              <TextField select fullWidth label="Customer" defaultValue="" {...register('customerId', { required: true })} InputLabelProps={{ shrink: true }}>
                <MenuItem value=""><em>Select customer</em></MenuItem>
                {customers.map((c) => <MenuItem key={c.id} value={c.id}>{c.customerName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField select fullWidth label="Against Invoice" defaultValue="" {...register('invoiceId')} InputLabelProps={{ shrink: true }}>
                <MenuItem value=""><em>None</em></MenuItem>
                {invoices.map((i) => <MenuItem key={i.id} value={i.id}>{i.invoiceNumber}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth type="date" label="Return Date" {...register('returnDate')} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField select fullWidth label="Status" defaultValue="Pending" {...register('status')} InputLabelProps={{ shrink: true }}>
                {['Pending', 'Completed', 'Rejected'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>

          <LineItems items={items} onChange={setItems} products={products} fields={['rate']} blank={blankItem} />

          <Grid container spacing={2}>
            <Grid item xs={12} md={7}>
              <TextField fullWidth label="Reason for return" multiline minRows={3} {...register('reason')} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontWeight={800}>Total Refund</Typography>
                  <Typography fontWeight={800} color="error.main">{currency(totalRefund)}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Returned quantities are added back to stock.
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button onClick={() => setOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2, minWidth: 140 }}>
              {isSubmitting ? 'Saving…' : 'Save Return'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Sales Return"
        message={`Are you sure you want to delete "${deleting?.returnNumber}"?`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
