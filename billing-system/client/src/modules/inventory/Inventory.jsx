import AddIcon from '@mui/icons-material/Add';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PriceCheckIcon from '@mui/icons-material/PriceCheck';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import TimelineIcon from '@mui/icons-material/Timeline';
import TuneIcon from '@mui/icons-material/Tune';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import {
  alpha, Box, Button, Chip, Grid, MenuItem, Paper, InputAdornment,
  Stack, Tab, Tabs, TextField, Typography, useTheme, Tooltip,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { inventoryApi, productsApi, warehousesApi } from '../../services/resource.service.js';
import { currency, date } from '../../utils/formatters.js';

function StockStatusChip({ status }) {
  if (!status || status === 'Out of Stock') return <Chip label="Out of Stock" size="small" color="error" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
  if (status === 'Low Stock') return <Chip label="Low Stock" size="small" color="warning" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
  return <Chip label="In Stock" size="small" color="success" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
}

function AvailQty({ available, reserved, total }) {
  const theme = useTheme();
  const color = available <= 0 ? theme.palette.error.main : available <= (total * 0.2) ? theme.palette.warning.main : theme.palette.success.main;
  return (
    <Stack spacing={0}>
      <Typography fontWeight={800} fontSize="1rem" color={color}>{available}</Typography>
      {reserved > 0 && (
        <Typography variant="caption" color="text.secondary">
          {reserved} reserved
        </Typography>
      )}
    </Stack>
  );
}

const MOVEMENT_TYPES = ['Sale', 'Purchase', 'Sale Return', 'Opening Stock', 'Adjustment In', 'Adjustment Out'];

export default function Inventory() {
  const [tab, setTab] = useState(0);
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [movements, setMovements] = useState([]);
  const [meta, setMeta] = useState({});
  const [wmsRows, setWmsRows] = useState([]);
  const [wmsMeta, setWmsMeta] = useState({});
  const [warehouses, setWarehouses] = useState([]);
  const [query, setQuery] = useState({ page: 1, limit: 10, productId: '', type: '' });
  const [wmsQuery, setWmsQuery] = useState({ page: 1, limit: 20, warehouseId: '', productId: '', status: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { showToast } = useToast();
  const theme = useTheme();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [pr, sr, wh] = await Promise.all([
        productsApi.list({ limit: 200 }),
        inventoryApi.summary().catch(() => null),
        warehousesApi.list({ locationType: 'Warehouse', limit: 100 }).catch(() => ({ data: [] })),
      ]);
      setProducts(pr?.data || []);
      setSummary(sr || null);
      setWarehouses(wh?.data || []);

      if (tab === 1) {
        const params = { ...query };
        if (!params.productId) delete params.productId;
        if (!params.type) delete params.type;
        const result = await inventoryApi.movements(params);
        setMovements(result?.data || []);
        setMeta(result?.meta || {});
      }
      if (tab === 2) {
        await loadWmsStock();
      }
    } catch {
      setProducts([]);
      setSummary(null);
    }
    setLoading(false);
  };

  const loadWmsStock = async () => {
    setLoading(true);
    try {
      const params = { ...wmsQuery };
      if (!params.warehouseId) delete params.warehouseId;
      if (!params.productId) delete params.productId;
      if (!params.status) delete params.status;
      if (!params.search) delete params.search;
      const result = await inventoryApi.wmsStock(params);
      setWmsRows(result?.data || []);
      setWmsMeta(result?.meta || {});
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not load WMS stock', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [query, tab]);
  useEffect(() => { if (tab === 2) loadWmsStock(); }, [wmsQuery]);

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
          onChange={(_, v) => {
            setTab(v);
            setQuery({ page: 1, limit: 10, productId: '', type: '' });
            setWmsQuery({ page: 1, limit: 20, warehouseId: '', productId: '', status: '', search: '' });
          }}
          sx={{
            px: 2,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.03),
          }}
        >
          <Tab label="Current Stock" icon={<Inventory2Icon sx={{ fontSize: 16 }} />} iconPosition="start" />
          <Tab label="Movement History" icon={<TimelineIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
          <Tab label="WMS Stock View" icon={<WarehouseIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
        </Tabs>

        <Box sx={{ p: { xs: 1.5, sm: 2.5 } }}>
          {loading ? <Loader /> : (
            <>
              {/* ── Tab 0: Simple current stock ── */}
              {tab === 0 && (
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
                    { field: 'status', headerName: 'Status', render: (row) => {
                      const s = Number(row.stock || 0);
                      const t = Number(row.lowStockThreshold || 0);
                      const st = s <= 0 ? 'Out of Stock' : s <= t ? 'Low Stock' : 'In Stock';
                      return <StockStatusChip status={st} />;
                    }},
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
              )}

              {/* ── Tab 1: Movement History ── */}
              {tab === 1 && (
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
                      { field: 'previousQuantity', headerName: 'Opening Bal.', render: (row) => <Typography fontWeight={600} color="text.secondary">{row.previousQuantity}</Typography> },
                      { field: 'quantity', headerName: 'Qty', render: (row) => (
                        <Typography
                          fontWeight={800}
                          color={Number(row.quantity) > 0 ? 'success.main' : 'error.main'}
                        >
                          {Number(row.quantity) > 0 ? '+' : ''}{row.quantity}
                        </Typography>
                      )},
                      { field: 'currentQuantity', headerName: 'Closing Bal.', render: (row) => <Typography fontWeight={700}>{row.currentQuantity}</Typography> },
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
              )}

              {/* ── Tab 2: WMS Stock View ── */}
              {tab === 2 && (
                <Stack spacing={2}>
                  {/* WMS Filters */}
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap">
                      <TextField
                        size="small" label="Search Product / SKU" value={wmsQuery.search}
                        onChange={(e) => setWmsQuery({ ...wmsQuery, search: e.target.value, page: 1 })}
                        sx={{ minWidth: 220 }}
                        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                      />
                      <TextField
                        select size="small" label="Warehouse" value={wmsQuery.warehouseId}
                        onChange={(e) => setWmsQuery({ ...wmsQuery, warehouseId: e.target.value, page: 1 })}
                        sx={{ minWidth: 200 }}
                      >
                        <MenuItem value="">All Warehouses</MenuItem>
                        {warehouses.map((w) => <MenuItem key={w.id} value={w.id}>{w.branchName}</MenuItem>)}
                      </TextField>
                      <TextField
                        select size="small" label="Product" value={wmsQuery.productId}
                        onChange={(e) => setWmsQuery({ ...wmsQuery, productId: e.target.value, page: 1 })}
                        sx={{ minWidth: 200 }}
                      >
                        <MenuItem value="">All Products</MenuItem>
                        {products.map((p) => <MenuItem key={p.id} value={p.id}>{p.productName}</MenuItem>)}
                      </TextField>
                      <TextField
                        select size="small" label="Status" value={wmsQuery.status}
                        onChange={(e) => setWmsQuery({ ...wmsQuery, status: e.target.value, page: 1 })}
                        sx={{ minWidth: 160 }}
                      >
                        <MenuItem value="">All Status</MenuItem>
                        <MenuItem value="In Stock">In Stock</MenuItem>
                        <MenuItem value="Low Stock">Low Stock</MenuItem>
                        <MenuItem value="Out of Stock">Out of Stock</MenuItem>
                      </TextField>
                    </Stack>
                  </Paper>

                  {/* WMS Table */}
                  <Box sx={{ overflowX: 'auto' }}>
                    <DataTable
                      mobileKeyField="productName"
                      columns={[
                        {
                          field: 'productName', headerName: 'Product',
                          render: (row) => (
                            <Stack spacing={0}>
                              <Typography fontWeight={700} fontSize="0.85rem">{row.productName}</Typography>
                              <Typography variant="caption" color="text.secondary">{row.sku || '—'}</Typography>
                            </Stack>
                          ),
                        },
                        {
                          field: 'warehouseName', headerName: 'Warehouse',
                          render: (row) => (
                            <Chip
                              icon={<WarehouseIcon sx={{ fontSize: 12 }} />}
                              label={row.warehouseName || '—'}
                              size="small"
                              variant="outlined"
                              color="primary"
                              sx={{ fontWeight: 600, fontSize: '0.72rem' }}
                            />
                          ),
                        },
                        {
                          field: 'zone', headerName: 'Zone',
                          render: (row) => row.zone
                            ? <Chip label={row.zone} size="small" sx={{ bgcolor: alpha(theme.palette.info.main, 0.12), color: 'info.dark', fontWeight: 600, fontSize: '0.72rem' }} />
                            : <Typography variant="caption" color="text.disabled">—</Typography>,
                        },
                        {
                          field: 'aisle', headerName: 'Aisle',
                          render: (row) => row.aisle
                            ? <Typography variant="body2" fontWeight={600}>{row.aisle}</Typography>
                            : <Typography variant="caption" color="text.disabled">—</Typography>,
                        },
                        {
                          field: 'rack', headerName: 'Rack',
                          render: (row) => row.rack
                            ? <Typography variant="body2" fontWeight={600}>{row.rack}</Typography>
                            : <Typography variant="caption" color="text.disabled">—</Typography>,
                        },
                        {
                          field: 'shelf', headerName: 'Shelf',
                          render: (row) => row.shelf
                            ? <Typography variant="body2" fontWeight={600}>{row.shelf}</Typography>
                            : <Typography variant="caption" color="text.disabled">—</Typography>,
                        },
                        {
                          field: 'bin', headerName: 'Bin',
                          render: (row) => row.bin
                            ? <Chip label={row.bin} size="small" sx={{ bgcolor: alpha(theme.palette.secondary.main, 0.12), color: 'secondary.dark', fontWeight: 700, fontFamily: 'monospace' }} />
                            : <Typography variant="caption" color="text.disabled">—</Typography>,
                        },
                        {
                          field: 'availableQty', headerName: 'Available',
                          render: (row) => <AvailQty available={row.availableQty} reserved={row.reservedQty} total={row.totalQty} />,
                        },
                        {
                          field: 'reservedQty', headerName: 'Reserved',
                          render: (row) => (
                            <Typography fontWeight={600} color={row.reservedQty > 0 ? 'warning.main' : 'text.disabled'}>
                              {row.reservedQty || 0}
                            </Typography>
                          ),
                        },
                        {
                          field: 'totalQty', headerName: 'Total',
                          render: (row) => <Typography fontWeight={700}>{row.totalQty || 0}</Typography>,
                        },
                        {
                          field: 'minStockLevel', headerName: 'Min Level',
                          render: (row) => <Typography variant="body2" color="text.secondary">{row.minStockLevel || 0}</Typography>,
                        },
                        {
                          field: 'stockStatus', headerName: 'Status',
                          render: (row) => <StockStatusChip status={row.stockStatus} />,
                        },
                      ]}
                      rows={wmsRows}
                    />
                  </Box>
                  <Pagination
                    meta={wmsMeta}
                    onChangePage={(p) => setWmsQuery({ ...wmsQuery, page: p })}
                    onChangeLimit={(l) => setWmsQuery({ ...wmsQuery, limit: l })}
                  />
                </Stack>
              )}
            </>
          )}
        </Box>
      </Paper>

      {/* Adjust Stock Modal */}
      <Modal open={open} title="Adjust Stock" onClose={() => setOpen(false)} maxWidth="sm">
        <Stack spacing={2.5} component="form" onSubmit={handleSubmit(submit)} sx={{ pt: 0.5 }}>
          <TextField select fullWidth label="Product" required {...register('productId', { required: true })}>
            {products.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                <Stack>
                  <Typography variant="body2" fontWeight={600}>{p.productName}</Typography>
                  <Typography variant="caption" color="text.secondary">Current: {p.stock} units</Typography>
                </Stack>
              </MenuItem>
            ))}
          </TextField>
          <TextField select fullWidth label="Adjustment Type" required {...register('type', { required: true })}>
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
          <TextField fullWidth type="number" label="Quantity" inputProps={{ min: 1 }} required {...register('quantity', { required: true, min: 1 })} />
          <TextField fullWidth multiline minRows={2} label="Notes / Reason" required {...register('notes', { required: true })} />
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
