import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StoreIcon from '@mui/icons-material/Store';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import {
  Alert, Box, Button, Chip, Grid, IconButton, MenuItem,
  Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';
import { productsApi, settingsApi } from '../services/resource.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { can } from '../utils/access.js';

const empty = {
  branchName: '', branchCode: '', gstNumber: '', phone: '', email: '',
  address: '', city: '', state: '', pincode: '', invoicePrefix: '',
};

const fields = [
  { name: 'branchName', label: 'Branch Name', required: true, sm: 6 },
  { name: 'branchCode', label: 'Branch Code', required: true, sm: 6 },
  { name: 'gstNumber', label: 'GST Number', sm: 6 },
  { name: 'invoicePrefix', label: 'Invoice Prefix', sm: 6 },
  { name: 'phone', label: 'Phone', sm: 6 },
  { name: 'email', label: 'Email', sm: 6 },
  { name: 'address', label: 'Address', sm: 12, multiline: true },
  { name: 'city', label: 'City', sm: 4 },
  { name: 'state', label: 'State', sm: 4 },
  { name: 'pincode', label: 'Pincode', sm: 4 },
];

export default function Branches() {
  const [rows, setRows] = useState([]);
  const [multiBranch, setMultiBranch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [transfer, setTransfer] = useState({ productId: '', fromBranchId: '', toBranchId: '', quantity: '' });
  const [split, setSplit] = useState(null);
  const { showToast } = useToast();
  const { user } = useAuth();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: empty });

  const load = async () => {
    setLoading(true);
    try {
      const [list, settings, prods] = await Promise.all([
        api.get('/branches', { params: { limit: 100 } }).then((r) => r.data),
        settingsApi.get(),
        productsApi.list({ limit: 200 }),
      ]);
      setRows(list?.data || []);
      setMultiBranch(Boolean(settings?.company?.multiBranchEnabled));
      setProducts(prods?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load branches', 'error');
      setRows([]);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openForm = (row = null) => { setEditing(row || {}); reset(row || empty); };

  const submit = async (values) => {
    try {
      if (editing.id) await api.put(`/branches/${editing.id}`, values);
      else await api.post('/branches', values);
      showToast('Branch saved');
      setEditing(null);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save branch';
      const details = err.response?.data?.errors?.map((e) => `${e.path || e.param}: ${e.msg}`).join(', ');
      showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };

  const makeDefault = async (row) => {
    try {
      await api.put(`/branches/${row.id}`, { isDefault: true });
      showToast(`${row.branchName} is now the default branch`);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to set default', 'error');
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/branches/${deleting.id}`);
      showToast('Branch deleted');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to delete branch', 'error');
    }
    setDeleting(null);
    load();
  };

  const showSplit = async (productId) => {
    if (!productId) { setSplit(null); return; }
    try {
      setSplit(await api.get(`/branches/stock/${productId}`).then((r) => r.data));
    } catch {
      setSplit(null);
    }
  };

  const submitTransfer = async () => {
    try {
      await api.post('/branches/transfer', {
        productId: Number(transfer.productId),
        fromBranchId: Number(transfer.fromBranchId),
        toBranchId: Number(transfer.toBranchId),
        quantity: Number(transfer.quantity),
      });
      showToast('Stock transferred');
      setTransferOpen(false);
      setTransfer({ productId: '', fromBranchId: '', toBranchId: '', quantity: '' });
      setSplit(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Transfer failed', 'error');
    }
  };

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Branches"
        subtitle="Locations this business operates from, and the stock held at each"
        icon={<StoreIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button startIcon={<SwapHorizIcon />} variant="outlined" onClick={() => setTransferOpen(true)}>
              Transfer Stock
            </Button>
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>
              Add Branch
            </Button>
          </Stack>
        }
      />

      {!multiBranch && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          <strong>Single-branch mode.</strong> Everything runs against the default branch and the app behaves
          exactly as it always has. Add branches here first, then turn on <em>Enable multiple branches</em> in
          Settings to start tracking stock and staff per location.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Branches" value={rows.length} detail="Active locations" icon={<StoreIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Mode" value={multiBranch ? 'Multi' : 'Single'} detail={multiBranch ? 'Per-branch stock' : 'One shared location'} icon={<StoreIcon />} gradient={multiBranch ? 'success' : 'info'} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Total Stock" value={rows.reduce((sum, r) => sum + Number(r.totalStock || 0), 0)} detail="Units across branches" icon={<StoreIcon />} gradient="warning" />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="branchName"
          rows={rows}
          columns={[
            { field: 'branchName', headerName: 'Branch', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.branchName}</Typography>
                <Typography variant="caption" color="text.secondary">{[r.city, r.state].filter(Boolean).join(', ') || '—'}</Typography>
              </Box>
            )},
            { field: 'branchCode', headerName: 'Code', render: (r) => (
              <Chip label={r.branchCode} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }} />
            )},
            { field: 'gstNumber', headerName: 'GST', render: (r) => r.gstNumber || '—' },
            { field: 'totalStock', headerName: 'Stock', render: (r) => (
              <Typography fontWeight={700}>{Number(r.totalStock || 0)}</Typography>
            )},
            { field: 'isDefault', headerName: 'Default', render: (r) => (r.isDefault
              ? <Chip label="Default" size="small" color="primary" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
              : <Typography variant="caption" color="text.disabled">—</Typography>
            )},
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.25}>
                <Tooltip title={r.isDefault ? 'Current default' : 'Make default'}>
                  <span>
                    <IconButton size="small" disabled={r.isDefault} onClick={() => makeDefault(r)} sx={{ borderRadius: 1.5 }}>
                      {r.isDefault ? <StarIcon fontSize="small" color="primary" /> : <StarBorderIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Edit">
                  <IconButton size="small" color="primary" onClick={() => openForm(r)} sx={{ borderRadius: 1.5 }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={can('deleteBranch', user?.role) ? 'Delete' : 'Only an Admin can delete a branch'}>
                  <span>
                    <IconButton
                      size="small" color="error" sx={{ borderRadius: 1.5 }}
                      disabled={r.isDefault || !can('deleteBranch', user?.role)}
                      onClick={() => setDeleting(r)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            )},
          ]}
        />
      )}

      {/* Add / edit branch */}
      <Modal open={Boolean(editing)} title={editing?.id ? 'Update Branch' : 'Add Branch'} onClose={() => setEditing(null)}>
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)}>
          {fields.map((f) => (
            <Grid item xs={12} sm={f.sm} key={f.name}>
              <TextField
                fullWidth label={f.label}
                multiline={f.multiline} minRows={f.multiline ? 2 : undefined}
                {...register(f.name, { required: f.required && 'Required' })}
                error={Boolean(errors[f.name])} helperText={errors[f.name]?.message}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          ))}
          <Grid item xs={12}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
              <Button type="button" onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2 }}>
                {isSubmitting ? 'Saving…' : editing?.id ? 'Update Branch' : 'Add Branch'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Modal>

      {/* Transfer stock */}
      <Modal open={transferOpen} title="Transfer Stock Between Branches" onClose={() => setTransferOpen(false)} maxWidth="sm">
        <Stack spacing={2}>
          <TextField
            select fullWidth size="small" label="Product"
            value={transfer.productId}
            onChange={(e) => { setTransfer({ ...transfer, productId: e.target.value }); showSplit(e.target.value); }}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value=""><em>Select product</em></MenuItem>
            {products.map((p) => <MenuItem key={p.id} value={p.id}>{p.productName}</MenuItem>)}
          </TextField>

          {split && (
            <Paper variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">Current stock</Typography>
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {split.branches.map((b) => (
                  <Stack key={b.branchId} direction="row" justifyContent="space-between">
                    <Typography variant="body2">{b.branchName}</Typography>
                    <Typography variant="body2" fontWeight={700}>{b.stock}</Typography>
                  </Stack>
                ))}
                {!split.branches.length && <Typography variant="body2" color="text.secondary">No stock recorded.</Typography>}
              </Stack>
            </Paper>
          )}

          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                select fullWidth size="small" label="From branch"
                value={transfer.fromBranchId}
                onChange={(e) => setTransfer({ ...transfer, fromBranchId: e.target.value })}
                InputLabelProps={{ shrink: true }}
              >
                {rows.map((b) => <MenuItem key={b.id} value={b.id}>{b.branchName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select fullWidth size="small" label="To branch"
                value={transfer.toBranchId}
                onChange={(e) => setTransfer({ ...transfer, toBranchId: e.target.value })}
                InputLabelProps={{ shrink: true }}
              >
                {rows.filter((b) => String(b.id) !== String(transfer.fromBranchId))
                  .map((b) => <MenuItem key={b.id} value={b.id}>{b.branchName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth size="small" label="Quantity" type="number"
                inputProps={{ min: 1, step: 1 }}
                value={transfer.quantity}
                onChange={(e) => setTransfer({ ...transfer, quantity: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button type="button" onClick={() => setTransferOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button
              variant="contained" sx={{ borderRadius: 2 }}
              disabled={!transfer.productId || !transfer.fromBranchId || !transfer.toBranchId || !(Number(transfer.quantity) > 0)}
              onClick={submitTransfer}
            >
              Transfer
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Branch"
        message={`Delete "${deleting?.branchName}"? Any stock it holds must be transferred out first.`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
