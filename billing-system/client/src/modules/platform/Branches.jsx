import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StoreIcon from '@mui/icons-material/Store';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import {
  Alert, Box, Button, Chip, Grid, IconButton, MenuItem,
  Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import { useDataTable } from '../../components/dataTable/useDataTable.js';
import Modal from '../../components/Modal.jsx';
import ListPageShell from '../../components/ListPageShell.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import api from '../../services/api.js';
import { productsApi, settingsApi } from '../../services/resource.service.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { can } from '../../utils/access.js';
import { requiredRule } from '../../hooks/useRequiredFields.js';

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
  // What the eye opens: the branch as a record, without the risk of editing it
  // by accident while looking something up.
  const [viewing, setViewing] = useState(null);
  const [tab, setTab] = useState('all');
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

  /**
   * Lifted out of the JSX so the table hook can read them before rendering.
   *
   * `sortValue` is supplied wherever the cell shows something other than the
   * value being ordered — Stock renders a styled number, and sorting on the
   * rendered text would put 9 after 10. `filterType` turns the plain text box
   * into the control the column deserves.
   */
  const columns = useMemo(() => [
    { field: 'branchName', headerName: 'Branch', render: (r) => (
      <Box>
        <Typography fontWeight={700} variant="body2">{r.branchName}</Typography>
        <Typography variant="caption" color="text.secondary">{[r.city, r.state].filter(Boolean).join(', ') || '—'}</Typography>
      </Box>
    )},
    { field: 'branchCode', headerName: 'Code', filterType: 'DROPDOWN', render: (r) => (
      <Chip label={r.branchCode} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }} />
    )},
    { field: 'gstNumber', headerName: 'GST', render: (r) => r.gstNumber || '—' },
    {
      field: 'totalStock', headerName: 'Stock', align: 'right', filterType: 'NUMBER',
      sortValue: (r) => Number(r.totalStock || 0),
      render: (r) => <Typography fontWeight={700}>{Number(r.totalStock || 0)}</Typography>,
    },
    { field: 'isDefault', headerName: 'Default', filterType: 'DROPDOWN', render: (r) => (r.isDefault
      ? <Chip label="Default" size="small" color="primary" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
      : <Typography variant="caption" color="text.disabled">—</Typography>
    )},
    // Edit lives at the start of the row now, as an eye and a pencil. What is
    // left here is what is specific to a branch: making it the default, and
    // deleting it.
    { field: 'actions', headerName: 'Actions', render: (r) => (
      <Stack direction="row" spacing={0.25}>
        <Tooltip title={r.isDefault ? 'Current default' : 'Make default'}>
          <span>
            <IconButton size="small" disabled={r.isDefault} onClick={() => makeDefault(r)} sx={{ borderRadius: 1.5 }}>
              {r.isDefault ? <StarIcon fontSize="small" color="primary" /> : <StarBorderIcon fontSize="small" />}
            </IconButton>
          </span>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [user?.role]);

  /**
   * The status strip. Branches have no workflow state, so the useful split is
   * by what kind of location it is — a warehouse and a shop are managed by
   * different people and rarely looked at together.
   */
  const tabs = useMemo(() => {
    const counts = rows.reduce((totals, row) => {
      const type = row.locationType || 'Branch';
      totals[type] = (totals[type] || 0) + 1;
      return totals;
    }, {});
    return [
      { value: 'all', label: 'All Locations', count: rows.length },
      ...Object.entries(counts).map(([type, count]) => ({ value: type, label: type, count })),
    ];
  }, [rows]);

  const visibleRows = useMemo(
    () => (tab === 'all' ? rows : rows.filter((row) => (row.locationType || 'Branch') === tab)),
    [rows, tab],
  );

  const table = useDataTable({
    data: visibleRows,
    columns,
    rowKey: (row) => String(row.id),
    defaultItemsPerPage: 25,
  });

  return (
    <ListPageShell
      breadcrumb={{
        backPath: '/',
        items: [{ label: 'Administration' }, { label: 'Branches', active: true }],
        actions: (
          <>
            <Button size="small" startIcon={<SwapHorizIcon />} variant="outlined" onClick={() => setTransferOpen(true)}>
              Transfer Stock
            </Button>
            <Button size="small" startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>
              Add Branch
            </Button>
          </>
        ),
      }}
      tabs={{ tabs, value: tab, onChange: setTab }}
      cards={[
        { key: 'count', label: 'Branches', value: rows.length, detail: 'Active locations', icon: <StoreIcon />, tone: 'primary' },
        {
          key: 'mode',
          label: 'Mode',
          value: multiBranch ? 'Multi' : 'Single',
          detail: multiBranch ? 'Per-branch stock' : 'One shared location',
          icon: <StoreIcon />,
          tone: multiBranch ? 'success' : 'info',
        },
        {
          key: 'stock',
          label: 'Total Stock',
          value: rows.reduce((sum, r) => sum + Number(r.totalStock || 0), 0),
          detail: 'Units across branches',
          icon: <StoreIcon />,
          tone: 'warning',
        },
      ]}
    >
      {!multiBranch && (
        <Alert severity="info" sx={{ borderRadius: 1, mb: 1.5 }}>
          <strong>Single-branch mode.</strong> Everything runs against the default branch and the app behaves
          exactly as it always has. Add branches here first, then turn on <em>Enable multiple branches</em> in
          Settings to start tracking stock and staff per location.
        </Alert>
      )}

      <DataTable
        {...table}
        mobileKeyField="branchName"
        loading={loading}
        fill
        searchable
        columnFilters
        selectable
        exportable
        onRefresh={load}
        onViewRow={setViewing}
        onEdit={openForm}
        emptyMessage="No branches yet"
      />

      {/* View branch — what the eye at the start of the row opens. */}
      <Modal open={Boolean(viewing)} title={viewing?.branchName || 'Branch'} onClose={() => setViewing(null)} maxWidth="sm">
        {viewing && (
          <Stack spacing={1.5}>
            <Grid container spacing={1.5}>
              {fields.map((f) => (
                <Grid item xs={12} sm={f.multiline ? 12 : 6} key={f.name}>
                  <Typography variant="caption" color="text.secondary">{f.label}</Typography>
                  <Typography variant="body2" fontWeight={600}>{viewing[f.name] || '—'}</Typography>
                </Grid>
              ))}
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Stock held</Typography>
                <Typography variant="body2" fontWeight={600}>{Number(viewing.totalStock || 0)}</Typography>
              </Grid>
            </Grid>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setViewing(null)}>Close</Button>
              <Button
                variant="contained"
                onClick={() => { const row = viewing; setViewing(null); openForm(row); }}
              >
                Edit
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Add / edit branch */}
      <Modal open={Boolean(editing)} title={editing?.id ? 'Update Branch' : 'Add Branch'} onClose={() => setEditing(null)}>
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)}>
          {fields.map((f) => (
            <Grid item xs={12} sm={f.sm} key={f.name}>
              <TextField
                fullWidth label={f.label}
                multiline={f.multiline} minRows={f.multiline ? 2 : undefined}
                // `required` on the input as well as in the rule: the rule
                // decides whether it saves, the prop is what draws the asterisk
                // and tells a screen reader. They were out of step everywhere.
                required={Boolean(f.required)}
                {...register(f.name, f.required ? requiredRule(f.label) : {})}
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
    </ListPageShell>
  );
}
