import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import QrCodeIcon from '@mui/icons-material/QrCode';
import {
  alpha, Box, Button, Chip, FormControlLabel, Grid,
  IconButton, MenuItem, Stack, Switch, TextField, Tooltip,
  Typography, useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../services/api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import SearchBox from '../components/SearchBox.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { productsApi } from '../services/resource.service.js';
import { currency, mediaUrl } from '../utils/formatters.js';

const empty = {
  productName: '', categoryId: '', hsnCode: '', purchasePrice: 0,
  sellingPrice: 0, gstPercent: 18, stock: 0, barcode: '',
  lowStockThreshold: 5, isActive: true,
};

function ProductImage({ row }) {
  const url = mediaUrl(row.imageUrl);
  const theme = useTheme();
  return url ? (
    <img src={url} alt={row.productName} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }} />
  ) : (
    <Box sx={{
      width: 40, height: 40, bgcolor: alpha(theme.palette.primary.main, 0.08),
      borderRadius: 1.5, display: 'grid', placeItems: 'center', color: 'primary.main',
      border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
    }}>
      <Inventory2Icon sx={{ fontSize: 18 }} />
    </Box>
  );
}

function StockChip({ row }) {
  const stock = Number(row.stock || 0);
  const lowAt = Number(row.lowStockThreshold || 0);
  if (stock <= 0) return <Chip label="Out of Stock" color="error" size="small" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
  if (stock <= lowAt) return <Chip label={`Low: ${stock}`} color="warning" size="small" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
  return <Chip label={`${stock} in stock`} color="success" size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
}

export default function Products() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '', categoryId: '' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { showToast } = useToast();
  const theme = useTheme();
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({ defaultValues: empty });
  const formValues = watch();
  const formMargin = Number(formValues.sellingPrice || 0) - Number(formValues.purchasePrice || 0);

  const load = async () => {
    setLoading(true);
    try {
      const params = { ...query };
      if (!params.categoryId) delete params.categoryId;
      const [result, cats] = await Promise.all([
        productsApi.list(params),
        api.get('/products/categories').then((r) => r.data).catch(() => []),
      ]);
      setRows(result?.data || []);
      setMeta(result?.meta || {});
      setCategories(Array.isArray(cats) ? cats : []);
    } catch {
      setRows([]);
      setMeta({});
      setCategories([]);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const metrics = useMemo(() => {
    const totalUnits = rows.reduce((s, r) => s + Number(r.stock || 0), 0);
    const retailValue = rows.reduce((s, r) => s + Number(r.stock || 0) * Number(r.sellingPrice || 0), 0);
    const lowStock = rows.filter((r) => Number(r.stock || 0) <= Number(r.lowStockThreshold || 0)).length;
    return { totalUnits, retailValue, lowStock };
  }, [rows]);

  const openForm = (row = null) => {
    setEditing(row || {});
    reset(row ? { ...row, categoryId: row.categoryId || '', isActive: row.isActive !== false } : empty);
  };

  const submit = async (values) => {
    const fd = new FormData();
    Object.keys(values).forEach((k) => {
      if (k === 'image' && values[k]?.[0]) fd.append('image', values[k][0]);
      else if (!['image', 'imagePath', 'imageUrl', 'imageMimeType'].includes(k)) fd.append(k, values[k] ?? '');
    });
    editing.id ? await api.put(`/products/${editing.id}`, fd) : await api.post('/products', fd);
    showToast('Product saved');
    setEditing(null);
    load();
  };

  const remove = async () => {
    await productsApi.remove(deleting.id);
    showToast('Product deleted');
    setDeleting(null);
    load();
  };

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Product Catalog"
        subtitle="Manage your products, pricing, and stock levels"
        icon={<Inventory2Icon />}
        action={
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>
            Add Product
          </Button>
        }
      />

      {/* Stats */}
      <Grid container spacing={2}>
        <Grid item xs={6} md={4}>
          <StatsCard title="Catalog Items" value={meta.total || rows.length} detail="Total products" icon={<Inventory2Icon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={4}>
          <StatsCard title="Stock Value" value={currency(metrics.retailValue)} detail="Retail valuation" icon={<LocalOfferIcon />} gradient="success" />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatsCard title="Attention Needed" value={metrics.lowStock} detail="Low / out of stock" icon={<WarningAmberIcon />} gradient="warning" />
        </Grid>
      </Grid>

      {/* Filters */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <SearchBox value={query.search} onChange={(search) => setQuery({ ...query, search, page: 1 })} placeholder="Search products…" />
        <TextField
          select size="small" label="Category" value={query.categoryId}
          onChange={(e) => setQuery({ ...query, categoryId: e.target.value, page: 1 })}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All Categories</MenuItem>
          {categories.map((c) => <MenuItem value={c.id} key={c.id}>{c.name}</MenuItem>)}
        </TextField>
      </Stack>

      {/* Table */}
      {loading ? <Loader /> : (
        <>
          <DataTable
            mobileKeyField="productName"
            columns={[
              { field: 'image', headerName: 'Image', render: (row) => <ProductImage row={row} /> },
              { field: 'productName', headerName: 'Product' },
              { field: 'category', headerName: 'Category', render: (row) => row.Category?.name || '—' },
              { field: 'barcode', headerName: 'Barcode', render: (row) => row.barcode
                ? <Chip label={row.barcode} size="small" icon={<QrCodeIcon sx={{ fontSize: '14px !important' }} />} variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }} />
                : <Typography variant="caption" color="text.disabled">—</Typography>
              },
              { field: 'sellingPrice', headerName: 'Price', render: (row) => <Typography fontWeight={700}>{currency(row.sellingPrice)}</Typography> },
              { field: 'gstPercent', headerName: 'GST', render: (row) => `${Number(row.gstPercent || 0)}%` },
              { field: 'stock', headerName: 'Stock', render: (row) => <StockChip row={row} /> },
              { field: 'margin', headerName: 'Margin', render: (row) => {
                const m = Number(row.sellingPrice || 0) - Number(row.purchasePrice || 0);
                return <Chip label={currency(m)} size="small" color={m >= 0 ? 'success' : 'error'} variant="outlined" sx={{ fontWeight: 700, fontSize: '0.72rem' }} />;
              }},
              { field: 'actions', headerName: 'Actions', render: (row) => (
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Edit"><IconButton size="small" onClick={() => openForm(row)} sx={{ borderRadius: 1.5, color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.08), '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.15) } }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleting(row)} sx={{ borderRadius: 1.5, bgcolor: alpha(theme.palette.error.main, 0.08), '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.15) } }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                </Stack>
              )},
            ]}
            rows={rows}
            meta={meta}
          />
          <Pagination meta={meta} onChangePage={(p) => setQuery({ ...query, page: p })} onChangeLimit={(l) => setQuery({ ...query, limit: l })} />
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal open={Boolean(editing)} title={editing?.id ? 'Update Product' : 'Add Product'} onClose={() => setEditing(null)}>
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)} sx={{ pt: 0.5 }}>
          {/* Image upload + margin chip */}
          <Grid item xs={12}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              {editing?.imageUrl && <ProductImage row={editing} />}
              <Button variant="outlined" component="label" sx={{ borderRadius: 2 }}>
                Upload Image
                <input type="file" hidden accept="image/*" {...register('image')} />
              </Button>
              <Chip
                label={`Margin ${currency(formMargin)}`}
                color={formMargin >= 0 ? 'success' : 'error'}
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
            </Stack>
          </Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Product Name" {...register('productName', { required: 'Required' })} error={Boolean(errors.productName)} helperText={errors.productName?.message} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth select label="Category" defaultValue="" {...register('categoryId')} InputLabelProps={{ shrink: true }}>
              {categories.map((c) => <MenuItem value={c.id} key={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="HSN/SAC Code" {...register('hsnCode', { required: 'Required' })} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Barcode / SKU" {...register('barcode')} InputLabelProps={{ shrink: true }} /></Grid>
          {[
            ['purchasePrice', 'Purchase Price (₹)'],
            ['sellingPrice', 'Selling Price (₹)'],
            ['gstPercent', 'GST %'],
            ['stock', 'Opening Stock'],
            ['lowStockThreshold', 'Low Stock Alert At'],
          ].map(([name, label]) => (
            <Grid item xs={12} sm={6} key={name}>
              <TextField fullWidth type="number" label={label} {...register(name, { required: 'Required' })} InputLabelProps={{ shrink: true }} />
            </Grid>
          ))}
          <Grid item xs={12}>
            <FormControlLabel control={<Switch defaultChecked {...register('isActive')} />} label="Active for billing" />
          </Grid>
          <Grid item xs={12}>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2 }}>
                {isSubmitting ? 'Saving…' : 'Save Product'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleting?.productName}"? This action cannot be undone.`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
