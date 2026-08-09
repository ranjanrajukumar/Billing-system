import AddIcon from '@mui/icons-material/Add';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PriceCheckIcon from '@mui/icons-material/PriceCheck';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import TimelineIcon from '@mui/icons-material/Timeline';
import TuneIcon from '@mui/icons-material/Tune';
import {
  alpha, Box, Button, Chip, Grid, MenuItem, Paper,
  Stack, Tab, Tabs, TextField, Typography, useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { inventoryApi, productsApi } from '../services/resource.service.js';
import { currency, date } from '../utils/formatters.js';

function StockStatusChip({ row }) {
  const stock = Number(row.stock || 0);
  const lowAt = Number(row.lowStockThreshold || 0);
  if (stock <= 0) return <Chip label="Out of Stock" size="small" color="error" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
  if (stock <= lowAt) return <Chip label="Low Stock" size="small" color="warning" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
  return <Chip label="In Stock" size="small" color="success" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
}

const MOVEMENT_TYPES = ['Sale', 'Purchase', 'Sale Return', 'Opening Stock', 'Adjustment In', 'Adjustment Out'];

export default function Inventory() {
  const [tab, setTab] = useState(0);
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [movements, setMovements] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, productId: '', type: '' });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { showToast } = useToast();
  const theme = useTheme();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [pr, sr] = await Promise.all([
        productsApi.list({ limit: 200 }),
        inventoryApi.summary().catch(() => null),
      ]);
      setProducts(pr?.data || []);
      setSummary(sr || null);
      if (tab === 1) {
        const params = { ...query };
        if (!params.productId) delete params.productId;
        if (!params.type) delete params.type;
        const result = await inventoryApi.movements(params);
        setMovements(result?.data || []);
        setMeta(result?.meta || {});
      }
    } catch {
      setProducts([]);
      setSummary(null);
      setMovements([]);
      setMeta({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query, tab]);

  const submit = async (values) => {
    try {
      await inventoryApi.adjust(values);
      showToast('Stock adjusted successfully');
      setOpen(false);
      reset();
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error adjusting stock', 'error');
    }
  };

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Inventory Control"
        subtitle="Monitor stock levels, movements and adjustments"
        icon={<Inventory2Icon />}
        action={
          <Button startIcon={<TuneIcon />} variant="contained" onClick={() => setOpen(true)}>
            Adjust Stock
          </Button>
        }
      />

      {/* Summary KPIs */}
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatsCard title="Available Units" value={summary?.totalUnits ?? 0} detail={`${summary?.totalProducts ?? 0} products`} icon={<Inventory2Icon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Stock Value" value={currency(summary?.stockValue ?? 0)} detail="Retail valuation" icon={<PriceCheckIcon />} gradient="success" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Low Stock" value={summary?.lowStock ?? 0} detail="Needs reorder" icon={<ReportProblemIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Out of Stock" value={summary?.outOfStock ?? 0} detail="Blocked for billing" icon={<TimelineIcon />} gradient="error" />
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => { setTab(v); setQuery({ page: 1, limit: 10, productId: '', type: '' }); }}
          sx={{
            px: 2,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.03),
          }}
        >
          <Tab label="Current Stock" />
          <Tab label="Movement History" />
        </Tabs>

        <Box sx={{ p: { xs: 1.5, sm: 2.5 } }}>
          {loading ? <Loader /> : (
            tab === 0 ? (
              <DataTable
                mobileKeyField="productName"
                columns={[
                  { field: 'barcode', headerName: 'Barcode', render: (row) => row.barcode
                    ? <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.barcode}</Typography>
                    : <Typography variant="caption" color="text.disabled">—</Typography>
                  },
                  { field: 'productName', headerName: 'Product' },
                  { field: 'stock', headerName: 'Stock', render: (row) => (
                    <Typography fontWeight={800} fontSize="1rem" color={
                      Number(row.stock) <= 0 ? 'error.main' :
                      Number(row.stock) <= Number(row.lowStockThreshold) ? 'warning.main' : 'success.main'
                    }>
                      {row.stock}
                    </Typography>
                  )},
                  { field: 'status', headerName: 'Status', render: (row) => <StockStatusChip row={row} /> },
                  { field: 'lowStockThreshold', headerName: 'Reorder At' },
                  { field: 'sellingPrice', headerName: 'Unit Price', render: (row) => currency(row.sellingPrice) },
                  { field: 'value', headerName: 'Stock Value', render: (row) => (
                    <Typography fontWeight={700} color="primary.main">
                      {currency(Number(row.stock || 0) * Number(row.sellingPrice || 0))}
                    </Typography>
                  )},
                ]}
                rows={products}
              />
            ) : (
              <Stack spacing={2}>
                {/* Filters */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    select size="small" label="Product" value={query.productId}
                    onChange={(e) => setQuery({ ...query, productId: e.target.value, page: 1 })}
                    sx={{ minWidth: 240 }}
                  >
                    <MenuItem value="">All Products</MenuItem>
                    {products.map((p) => <MenuItem key={p.id} value={p.id}>{p.productName}</MenuItem>)}
                  </TextField>
                  <TextField
                    select size="small" label="Movement Type" value={query.type}
                    onChange={(e) => setQuery({ ...query, type: e.target.value, page: 1 })}
                    sx={{ minWidth: 200 }}
                  >
                    <MenuItem value="">All Types</MenuItem>
                    {MOVEMENT_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </TextField>
                </Stack>

                <DataTable
                  mobileKeyField="movementType"
                  columns={[
                    { field: 'addondt', headerName: 'Date', render: (row) => date(row.addondt) },
                    { field: 'product', headerName: 'Product', render: (row) => row.Product?.productName },
                    { field: 'movementType', headerName: 'Type', render: (row) => {
                      const isIn = Number(row.quantity) > 0;
                      return <Chip label={row.movementType} size="small" color={isIn ? 'success' : 'error'} variant="filled" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
                    }},
                    { field: 'quantity', headerName: 'Qty', render: (row) => (
                      <Typography
                        fontWeight={800}
                        color={Number(row.quantity) > 0 ? 'success.main' : 'error.main'}
                      >
                        {Number(row.quantity) > 0 ? '+' : ''}{row.quantity}
                      </Typography>
                    )},
                    { field: 'referenceType', headerName: 'Source' },
                    { field: 'stockUser', headerName: 'User', render: (row) => row.stockUser?.name || '—' },
                    { field: 'notes', headerName: 'Notes', render: (row) => (
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 140, display: 'block' }}>
                        {row.notes || '—'}
                      </Typography>
                    )},
                  ]}
                  rows={movements}
                  meta={meta}
                />
                <Pagination meta={meta} onChangePage={(p) => setQuery({ ...query, page: p })} onChangeLimit={(l) => setQuery({ ...query, limit: l })} />
              </Stack>
            )
          )}
        </Box>
      </Paper>

      {/* Adjust Stock Modal */}
      <Modal open={open} title="Adjust Stock" onClose={() => setOpen(false)} maxWidth="sm">
        <Stack spacing={2.5} component="form" onSubmit={handleSubmit(submit)} sx={{ pt: 0.5 }}>
          <TextField select fullWidth label="Product" {...register('productId', { required: true })}>
            {products.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                <Stack>
                  <Typography variant="body2" fontWeight={600}>{p.productName}</Typography>
                  <Typography variant="caption" color="text.secondary">Current: {p.stock} units</Typography>
                </Stack>
              </MenuItem>
            ))}
          </TextField>
          <TextField select fullWidth label="Adjustment Type" {...register('type', { required: true })}>
            <MenuItem value="Opening Stock">
              <Stack><Typography variant="body2" fontWeight={600}>Opening Stock (+)</Typography><Typography variant="caption" color="text.secondary">Set initial stock level</Typography></Stack>
            </MenuItem>
            <MenuItem value="Adjustment In">
              <Stack><Typography variant="body2" fontWeight={600}>Adjustment In (+)</Typography><Typography variant="caption" color="text.secondary">Stock received / found</Typography></Stack>
            </MenuItem>
            <MenuItem value="Adjustment Out">
              <Stack><Typography variant="body2" fontWeight={600}>Adjustment Out (−)</Typography><Typography variant="caption" color="text.secondary">Stock damaged / lost</Typography></Stack>
            </MenuItem>
          </TextField>
          <TextField fullWidth type="number" label="Quantity" inputProps={{ min: 1 }} {...register('quantity', { required: true, min: 1 })} />
          <TextField fullWidth multiline minRows={2} label="Notes / Reason" {...register('notes', { required: true })} />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button type="button" onClick={() => setOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2 }}>
              {isSubmitting ? 'Saving…' : 'Save Adjustment'}
            </Button>
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
