import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Alert, Autocomplete, Box, Button, Chip, Grid, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { branchesApi, productsApi, replenishmentApi, suppliersApi } from '../../services/resource.service.js';

/**
 * The parameters the replenishment engine plans with.
 *
 * A product with no row here is not unplanned — it falls back to the defaults
 * on the product master, and then to system defaults. This screen is for the
 * lines where that is not good enough: the fast seller in one store and the
 * slow one in another, the supplier who ships in pallets of 480, the line with
 * a six-week lead time from overseas.
 *
 * Setting these is what turns generic recommendations into ones a buyer agrees
 * with, so the screen shows what the engine would currently use for a line
 * before anything is typed.
 */

const SOURCES = [
  { value: 'Auto', label: 'Auto — transfer if spare stock exists, else purchase' },
  { value: 'Purchase', label: 'Always purchase' },
  { value: 'Transfer', label: 'Prefer transfer' },
];

const blank = {
  productId: '', branchId: '', minimumStock: '', maximumStock: '', safetyStock: '',
  leadTimeDays: '', reviewPeriodDays: '', orderMultiple: '', minimumOrderQty: '',
  preferredSource: 'Auto', preferredSupplierId: '', autoReplenish: false, notes: '',
};

export default function InventoryPolicies() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [effective, setEffective] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (search) params.search = search;
      const [list, prods, locs, sups] = await Promise.all([
        replenishmentApi.policies.list(params),
        productsApi.list({ limit: 500 }),
        branchesApi.list({ limit: 200 }),
        suppliersApi.list({ limit: 200 }),
      ]);
      setRows(list.data || []);
      setMeta(list.meta || {});
      setProducts(prods.data || []);
      setLocations(locs.data || []);
      setSuppliers(sups.data || []);
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load policies', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search]);

  // Show what the engine would use right now, so a planner can see whether a
  // policy is needed at all before writing one.
  useEffect(() => {
    if (!form.productId || !form.branchId) { setEffective(null); return; }
    let cancelled = false;
    replenishmentApi.policies
      .effective({ productId: form.productId, branchId: form.branchId })
      .then((data) => { if (!cancelled) setEffective(data); })
      .catch(() => { if (!cancelled) setEffective(null); });
    return () => { cancelled = true; };
  }, [form.productId, form.branchId]);

  const open = (row) => {
    if (row) {
      setForm({
        ...blank,
        ...Object.fromEntries(
          Object.keys(blank).map((key) => [key, row[key] ?? blank[key]]),
        ),
        productId: row.productId,
        branchId: row.branchId,
      });
    } else {
      setForm(blank);
    }
    setEditing(row || {});
  };

  const save = async () => {
    if (!form.productId || !form.branchId) {
      showToast('Pick a product and a location', 'error');
      return;
    }
    setBusy(true);
    try {
      await replenishmentApi.policies.save(form);
      showToast('Policy saved');
      setEditing(null);
      await load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not save the policy', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    setBusy(true);
    try {
      await replenishmentApi.policies.remove(row.id);
      showToast('Policy removed; this line now uses the product defaults');
      await load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not remove the policy', 'error');
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, type = 'number') => (
    <TextField
      label={label}
      type={type}
      size="small"
      fullWidth
      value={form[key] ?? ''}
      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
    />
  );

  const columns = [
    {
      field: 'product',
      headerName: 'Product',
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={700}>{row.Product?.productName || '-'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {row.Product?.sku || 'No SKU'} · {row.Branch?.branchName || '-'}
          </Typography>
        </Box>
      ),
    },
    { field: 'safetyStock', headerName: 'Safety', render: (row) => row.safetyStock ?? '—' },
    { field: 'minimumStock', headerName: 'Min', render: (row) => row.minimumStock ?? '—' },
    { field: 'maximumStock', headerName: 'Max', render: (row) => row.maximumStock ?? '—' },
    {
      field: 'leadTimeDays',
      headerName: 'Lead / review',
      render: (row) => `${row.leadTimeDays ?? '—'}d / ${row.reviewPeriodDays ?? '—'}d`,
    },
    {
      field: 'orderMultiple',
      headerName: 'Order rules',
      render: (row) => {
        const parts = [];
        if (row.orderMultiple) parts.push(`case of ${row.orderMultiple}`);
        if (row.minimumOrderQty) parts.push(`min ${row.minimumOrderQty}`);
        return parts.length ? parts.join(', ') : '—';
      },
    },
    {
      field: 'preferredSource',
      headerName: 'Source',
      render: (row) => <Chip size="small" variant="outlined" label={row.preferredSource} sx={{ fontSize: '0.7rem' }} />,
    },
    {
      field: 'actions',
      headerName: '',
      render: (row) => (
        <Stack direction="row" spacing={0.5}>
          <Button size="small" startIcon={<EditIcon />} onClick={() => open(row)}>Edit</Button>
          <Button size="small" color="error" startIcon={<DeleteIcon />} disabled={busy} onClick={() => remove(row)}>
            Remove
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Stock Policies"
        subtitle="Safety stock, lead times and order rules the replenishment engine plans with"
        icon={<TuneIcon />}
        action={(
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => open(null)}>
            New policy
          </Button>
        )}
      />

      <Alert severity="info">
        Products without a policy still get planned — they fall back to the product master, then
        to system defaults (7-day lead time, 7-day review). Add a policy only where a line needs
        different treatment at a particular location.
      </Alert>

      <TextField
        size="small" label="Search product or SKU" sx={{ maxWidth: 320 }}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {loading ? <Loader rows={6} /> : (
        <DataTable columns={columns} rows={rows} meta={meta} mobileKeyField="id" />
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit stock policy' : 'New stock policy'}
      >
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                size="small"
                options={products}
                getOptionLabel={(option) => `${option.productName}${option.sku ? ` (${option.sku})` : ''}`}
                value={products.find((product) => product.id === Number(form.productId)) || null}
                onChange={(_event, value) => setForm((current) => ({ ...current, productId: value?.id || '' }))}
                renderInput={(params) => <TextField {...params} label="Product" />}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select size="small" fullWidth label="Location"
                value={form.branchId}
                onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))}
              >
                {locations.map((location) => (
                  <MenuItem key={location.id} value={location.id}>
                    {location.branchName} ({location.locationType})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          {effective && (
            <Alert severity={effective.hasLocationPolicy ? 'warning' : 'info'} icon={false}>
              <Typography variant="caption">
                {effective.hasLocationPolicy
                  ? 'This line already has a policy; saving will replace it. '
                  : 'Currently planned with fallback values: '}
                safety {effective.effective?.safetyStock}, lead {effective.effective?.leadTimeDays}d,
                review {effective.effective?.reviewPeriodDays}d
                {' '}(cover window {effective.effective?.coverDays}d)
              </Typography>
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={6} sm={4}>{field('safetyStock', 'Safety stock')}</Grid>
            <Grid item xs={6} sm={4}>{field('minimumStock', 'Minimum stock')}</Grid>
            <Grid item xs={6} sm={4}>{field('maximumStock', 'Maximum stock')}</Grid>
            <Grid item xs={6} sm={4}>{field('leadTimeDays', 'Lead time (days)')}</Grid>
            <Grid item xs={6} sm={4}>{field('reviewPeriodDays', 'Review period (days)')}</Grid>
            <Grid item xs={6} sm={4}>{field('orderMultiple', 'Order multiple')}</Grid>
            <Grid item xs={6} sm={4}>{field('minimumOrderQty', 'Minimum order qty')}</Grid>
            <Grid item xs={12} sm={8}>
              <TextField
                select size="small" fullWidth label="Preferred source"
                value={form.preferredSource}
                onChange={(event) => setForm((current) => ({ ...current, preferredSource: event.target.value }))}
              >
                {SOURCES.map((source) => (
                  <MenuItem key={source.value} value={source.value}>{source.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select size="small" fullWidth label="Preferred supplier"
                value={form.preferredSupplierId || ''}
                onChange={(event) => setForm((current) => ({ ...current, preferredSupplierId: event.target.value }))}
              >
                <MenuItem value="">None</MenuItem>
                {suppliers.map((supplier) => (
                  <MenuItem key={supplier.id} value={supplier.id}>{supplier.supplierName}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>{field('notes', 'Notes', 'text')}</Grid>
          </Grid>

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="contained" onClick={save} disabled={busy}>Save policy</Button>
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
