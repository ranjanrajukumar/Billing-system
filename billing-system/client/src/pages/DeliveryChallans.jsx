import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PrintIcon from '@mui/icons-material/Print';
import {
  Button, Chip, Grid, IconButton, MenuItem,
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
import SearchBox from '../components/SearchBox.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { customersApi, deliveryChallansApi, productsApi } from '../services/resource.service.js';
import api from '../services/api.js';
import { date } from '../utils/formatters.js';
import { printHtml } from '../utils/print.js';

const blankItem = { productId: '', quantity: 1 };
const STATUS_COLORS = { Pending: 'warning', Delivered: 'success', Returned: 'error' };

export default function DeliveryChallans() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '' });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([blankItem]);
  const [deleting, setDeleting] = useState(null);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { challanDate: new Date().toISOString().slice(0, 10), customerId: '', status: 'Pending', vehicleNumber: '', notes: '' },
  });

  const load = async () => {
    setLoading(true);
    try {
      const [result, cr, pr] = await Promise.all([
        deliveryChallansApi.list(query),
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
      await deliveryChallansApi.create({ ...values, items: selected });
      showToast('Delivery challan saved');
      setOpen(false); setItems([blankItem]); reset(); load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error saving challan', 'error');
    }
  };

  const remove = async () => {
    try {
      await deliveryChallansApi.remove(deleting.id);
      showToast('Challan deleted');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to delete challan', 'error');
    }
    setDeleting(null);
    load();
  };

  const download = async (id) => {
    try {
      const blob = await api.get(`/delivery-challans/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to download challan', 'error');
    }
  };

  // Prints the designed HTML layout rather than the surrounding page.
  const print = async (id) => {
    try {
      printHtml(await api.get(`/delivery-challans/${id}/html`, { responseType: 'text' }).then((r) => r.data));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to print challan', 'error');
    }
  };

  const stats = useMemo(() => ({
    count: meta.total || rows.length,
    pending: rows.filter((r) => r.status === 'Pending').length,
    delivered: rows.filter((r) => r.status === 'Delivered').length,
  }), [rows, meta]);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Delivery Challans"
        subtitle="Track goods dispatched to customers and their delivery status"
        icon={<LocalShippingIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <SearchBox value={query.search} onChange={(search) => setQuery({ ...query, search, page: 1 })} placeholder="Search challans…" />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
              New Challan
            </Button>
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={6} md={4}>
          <StatsCard title="Total Challans" value={stats.count} detail="All dispatches" icon={<LocalShippingIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={4}>
          <StatsCard title="Pending" value={stats.pending} detail="Awaiting delivery" icon={<LocalShippingIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatsCard title="Delivered" value={stats.delivered} detail="This page" icon={<LocalShippingIcon />} gradient="success" />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <>
          <DataTable
            mobileKeyField="challanNumber"
            columns={[
              { field: 'challanNumber', headerName: 'Challan #', render: (r) => <Typography fontWeight={700} color="primary.main">{r.challanNumber}</Typography> },
              { field: 'challanDate', headerName: 'Date', render: (r) => date(r.challanDate) },
              { field: 'customer', headerName: 'Customer', render: (r) => r.Customer?.customerName || '—' },
              { field: 'vehicleNumber', headerName: 'Vehicle', render: (r) => r.vehicleNumber || '—' },
              { field: 'status', headerName: 'Status', render: (r) => <Chip label={r.status} size="small" color={STATUS_COLORS[r.status] || 'default'} sx={{ fontWeight: 700, fontSize: '0.7rem' }} /> },
              { field: 'actions', headerName: 'Actions', render: (r) => (
                <Stack direction="row" spacing={0.25}>
                  <Tooltip title="Download PDF">
                    <IconButton size="small" onClick={() => download(r.id)} sx={{ borderRadius: 1.5 }}><DownloadIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Print">
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

      <Modal open={open} title="New Delivery Challan" onClose={() => setOpen(false)} maxWidth="md">
        <Stack spacing={2.5} component="form" onSubmit={handleSubmit(submit)}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={3}>
              <TextField select fullWidth label="Customer" defaultValue="" {...register('customerId', { required: true })} InputLabelProps={{ shrink: true }}>
                <MenuItem value=""><em>Select customer</em></MenuItem>
                {customers.map((c) => <MenuItem key={c.id} value={c.id}>{c.customerName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth type="date" label="Challan Date" {...register('challanDate')} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth label="Vehicle Number" {...register('vehicleNumber')} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField select fullWidth label="Status" defaultValue="Pending" {...register('status')} InputLabelProps={{ shrink: true }}>
                {['Pending', 'Delivered', 'Returned'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>

          <LineItems items={items} onChange={setItems} products={products} fields={[]} blank={blankItem} />

          <TextField fullWidth label="Notes" multiline minRows={2} {...register('notes')} InputLabelProps={{ shrink: true }} />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button onClick={() => setOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2, minWidth: 140 }}>
              {isSubmitting ? 'Saving…' : 'Save Challan'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Challan"
        message={`Are you sure you want to delete "${deleting?.challanNumber}"?`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
