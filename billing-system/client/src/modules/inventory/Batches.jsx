import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ScienceIcon from '@mui/icons-material/Science';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Alert, Box, Button, Chip, Grid, IconButton, MenuItem, Stack, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import SearchBox from '../../components/SearchBox.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import api from '../../services/api.js';
import { productsApi } from '../../services/resource.service.js';
import { currency, date } from '../../utils/formatters.js';

const empty = {
  productId: '', batchNumber: '', lotNumber: '', quantity: '',
  germinationPercent: '', purity: '', packingDate: '', testDate: '', expiryDate: '',
  purchaseRate: '', supplierName: '', notes: '',
};

const STATUS_COLOUR = { Active: 'success', Expiring: 'warning', Expired: 'error', Exhausted: 'default' };

const TABS = [
  { key: '', label: 'All Batches' },
  { key: 'active', label: 'Usable' },
  { key: 'expiring', label: 'Expiring Soon' },
  { key: 'expired', label: 'Expired' },
];

export default function Batches() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '', status: '' });
  const [products, setProducts] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: empty });

  const load = async () => {
    setLoading(true);
    try {
      const [result, alertResult] = await Promise.all([
        api.get('/batches', { params: query }).then((r) => r.data),
        api.get('/batches/alerts', { params: { days: 60 } }).then((r) => r.data),
      ]);
      setRows(result?.data || []);
      setMeta(result?.meta || {});
      setAlerts(alertResult);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load batches', 'error');
      setRows([]); setMeta({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  useEffect(() => {
    productsApi.list({ limit: 200 }).then((r) => setProducts(r?.data || [])).catch(() => setProducts([]));
  }, []);

  const openForm = (row = null) => {
    setEditing(row || {});
    reset(row ? { ...empty, ...row } : empty);
  };

  const submit = async (values) => {
    // Blank optional numbers and dates must be dropped, not sent as ''.
    const payload = { ...values };
    for (const key of Object.keys(payload)) {
      if (payload[key] === '' || payload[key] == null) delete payload[key];
    }
    try {
      if (editing.id) await api.put(`/batches/${editing.id}`, payload);
      else await api.post('/batches', payload);
      showToast('Batch saved');
      setEditing(null);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save batch';
      const details = err.response?.data?.errors?.map((e) => `${e.path || e.param}: ${e.msg}`).join(', ');
      showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/batches/${deleting.id}`);
      showToast('Batch deleted');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to delete batch', 'error');
    }
    setDeleting(null);
    load();
  };

  const expiredCount = alerts?.expired?.length || 0;
  const expiringCount = alerts?.expiringSoon?.length || 0;

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Seed Batches"
        subtitle="Lot numbers, germination and sowing validity for every batch you hold"
        icon={<ScienceIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <SearchBox
              value={query.search}
              onChange={(search) => setQuery({ ...query, search, page: 1 })}
              placeholder="Search lot number…"
            />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>Add Batch</Button>
          </Stack>
        }
      />

      {expiredCount > 0 && (
        <Alert severity="error" icon={<WarningAmberIcon />}>
          {expiredCount} {expiredCount === 1 ? 'batch has' : 'batches have'} passed their sowing validity
          {alerts.expiredValue > 0 ? ` — about ${currency(alerts.expiredValue)} of stock` : ''}.
          These are never sold automatically.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={6} md={4}>
          <StatsCard title="Total Batches" value={meta.total ?? rows.length} detail="All lots on record" icon={<ScienceIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={4}>
          <StatsCard title="Expiring Soon" value={expiringCount} detail="Within 60 days" icon={<WarningAmberIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatsCard title="Expired" value={expiredCount} detail="Cannot be sold for sowing" icon={<WarningAmberIcon />} gradient="error" />
        </Grid>
      </Grid>

      <Tabs
        value={query.status}
        onChange={(_e, status) => setQuery({ ...query, status, page: 1 })}
        variant="scrollable"
        scrollButtons="auto"
      >
        {TABS.map((t) => <Tab key={t.key} value={t.key} label={t.label} />)}
      </Tabs>

      {loading && rows.length === 0 ? <Loader /> : (
        <Box sx={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
        <>
          <DataTable
            mobileKeyField="batchNumber"
            rows={rows}
            meta={meta}
            columns={[
              { field: 'batchNumber', headerName: 'Lot / Batch', render: (r) => (
                <Stack>
                  <Typography variant="body2" fontWeight={700} fontFamily="monospace">{r.batchNumber}</Typography>
                  {r.lotNumber && <Typography variant="caption" color="text.secondary">Lot {r.lotNumber}</Typography>}
                </Stack>
              )},
              { field: 'product', headerName: 'Product', render: (r) => r.Product?.productName || '—' },
              { field: 'quantity', headerName: 'Quantity', render: (r) => (
                <Typography fontWeight={700}>{r.quantity}</Typography>
              )},
              { field: 'germinationPercent', headerName: 'Germination', render: (r) => (
                r.germinationPercent != null ? `${Number(r.germinationPercent).toFixed(0)}%` : '—'
              )},
              { field: 'expiryDate', headerName: 'Valid Upto', render: (r) => (
                r.expiryDate ? (
                  <Stack>
                    <Typography variant="body2">{date(r.expiryDate)}</Typography>
                    {r.daysToExpiry != null && (
                      <Typography variant="caption" color={r.daysToExpiry < 0 ? 'error.main' : 'text.secondary'}>
                        {r.daysToExpiry < 0 ? `${Math.abs(r.daysToExpiry)} days ago` : `in ${r.daysToExpiry} days`}
                      </Typography>
                    )}
                  </Stack>
                ) : 'No expiry'
              )},
              { field: 'status', headerName: 'Status', render: (r) => (
                <Chip label={r.status} size="small" color={STATUS_COLOUR[r.status] || 'default'}
                  variant={r.status === 'Active' ? 'filled' : 'outlined'}
                  sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
              )},
              { field: 'actions', headerName: 'Actions', render: (r) => (
                <Stack direction="row" spacing={0.25}>
                  <Tooltip title="Edit">
                    <IconButton size="small" color="primary" onClick={() => openForm(r)} sx={{ borderRadius: 1.5 }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleting(r)} sx={{ borderRadius: 1.5 }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )},
            ]}
          />
          <Pagination
            meta={meta}
            onChangePage={(p) => setQuery({ ...query, page: p })}
            onChangeLimit={(l) => setQuery({ ...query, limit: l, page: 1 })}
          />
        </>
        </Box>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? 'Update Batch' : 'Add Batch'}
        onClose={() => setEditing(null)}
        maxWidth="sm"
      >
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)}>
          <Grid item xs={12}>
            <TextField
              select fullWidth label="Product"
              defaultValue={editing?.productId || ''}
              required {...register('productId', { required: 'Required' })}
              error={Boolean(errors.productId)} helperText={errors.productId?.message}
              disabled={Boolean(editing?.id)}
              InputLabelProps={{ shrink: true }}
            >
              {products.map((p) => <MenuItem key={p.id} value={p.id}>{p.productName}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth label="Batch Number" placeholder="ML259-33"
              required {...register('batchNumber', { required: 'Required' })}
              error={Boolean(errors.batchNumber)} helperText={errors.batchNumber?.message}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Lot Number" {...register('lotNumber')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth type="number" label="Quantity" inputProps={{ min: 0 }}
              required {...register('quantity', { required: 'Required' })}
              error={Boolean(errors.quantity)}
              helperText={errors.quantity?.message || 'Cannot exceed branch stock'}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth type="number" label="Germination %" inputProps={{ min: 0, max: 100, step: 'any' }}
              {...register('germinationPercent')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth type="number" label="Purity %" inputProps={{ min: 0, max: 100, step: 'any' }}
              {...register('purity')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth type="date" label="Packing Date" {...register('packingDate')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth type="date" label="Test Date" {...register('testDate')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth type="date" label="Valid Upto" {...register('expiryDate')}
              helperText="Blank means no expiry"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField fullWidth type="number" label="Purchase Rate" inputProps={{ min: 0, step: 'any' }}
              {...register('purchaseRate')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6}>
            <TextField fullWidth label="Supplier" {...register('supplierName')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Notes" {...register('notes')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
              <Button type="button" onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2 }}>
                {isSubmitting ? 'Saving…' : editing?.id ? 'Update Batch' : 'Add Batch'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Batch"
        message={`Delete batch ${deleting?.batchNumber}? Bills already issued keep their printed lot details.`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
