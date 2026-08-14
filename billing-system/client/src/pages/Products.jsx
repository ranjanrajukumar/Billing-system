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
import { productsApi, unitsApi } from '../services/resource.service.js';
import { currency, mediaUrl } from '../utils/formatters.js';

const DEFAULT_UNITS = [
  { code: 'PCS', name: 'Pieces' },
  { code: 'KG', name: 'Kilograms' },
  { code: 'BOX', name: 'Box' },
  { code: 'BAG', name: 'Bag' },
  { code: 'LTR', name: 'Liters' },
  { code: 'MTR', name: 'Meters' },
  { code: 'PACK', name: 'Pack' },
  { code: 'DOZEN', name: 'Dozen' },
];

const empty = {
  productName: '', sku: '', categoryId: '', hsnCode: '', purchasePrice: 0,
  sellingPrice: 0, mrp: '', wholesalePrice: '', dealerPrice: '',
  gstPercent: 18, stock: 0, barcode: '',
  lowStockThreshold: 5, minimumStock: 0, reorderLevel: '', reorderQuantity: '',
  primaryUnit: 'PCS', secondaryUnit: '',
  unitConversionFactor: 1, secondarySellingPrice: '',
  batchRequired: false, expiryRequired: false, serialRequired: false, warrantyMonths: '',
  size: '', color: '', isActive: true,
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
  const [units, setUnits] = useState(DEFAULT_UNITS);
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
      const [result, cats, masterUnitsRes] = await Promise.all([
        productsApi.list(params),
        api.get('/products/categories').then((r) => r.data).catch(() => []),
        unitsApi.list({ limit: 100 }).catch(() => ({ data: [] })),
      ]);
      setRows(result?.data || []);
      setMeta(result?.meta || {});
      setCategories(Array.isArray(cats) ? cats : []);
      const fetchedUnits = masterUnitsRes?.data || [];
      const mergedUnits = [...DEFAULT_UNITS];
      fetchedUnits.forEach((u) => {
        if (u.code && !mergedUnits.some((existing) => existing.code === u.code)) {
          mergedUnits.push({ code: u.code, name: u.name || u.code });
        }
      });
      setUnits(mergedUnits);
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
    // Reorder level is the buying trigger where one is set; the low-stock
    // threshold is the fallback warning line.
    const lowStock = rows.filter((r) => (
      Number(r.stock || 0) <= Number(r.reorderLevel ?? r.lowStockThreshold ?? 0)
    )).length;
    return { totalUnits, retailValue, lowStock };
  }, [rows]);

  const openForm = (row = null) => {
    setEditing(row || {});
    if (!row) { reset(empty); return; }

    // Optional columns come back as null; a null in a TextField makes it an
    // uncontrolled input, so they are blanked to '' on the way in and read back
    // as "not set" on the way out.
    const blankIfNull = (value) => (value === null || value === undefined ? '' : value);

    reset({
      ...row,
      categoryId: row.categoryId || '',
      sku: blankIfNull(row.sku),
      mrp: blankIfNull(row.mrp),
      wholesalePrice: blankIfNull(row.wholesalePrice),
      dealerPrice: blankIfNull(row.dealerPrice),
      secondarySellingPrice: blankIfNull(row.secondarySellingPrice),
      reorderLevel: blankIfNull(row.reorderLevel),
      reorderQuantity: blankIfNull(row.reorderQuantity),
      warrantyMonths: blankIfNull(row.warrantyMonths),
      size: blankIfNull(row.size),
      color: blankIfNull(row.color),
      minimumStock: row.minimumStock ?? 0,
      primaryUnit: row.primaryUnit || 'PCS',
      secondaryUnit: row.secondaryUnit || '',
      unitConversionFactor: row.unitConversionFactor ?? 1,
      batchRequired: Boolean(row.batchRequired),
      expiryRequired: Boolean(row.expiryRequired),
      serialRequired: Boolean(row.serialRequired),
      isActive: row.isActive !== false,
    });
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
              { field: 'sellingPrice', headerName: 'Price', render: (row) => (
                <Box>
                  <Typography fontWeight={700}>{currency(row.sellingPrice)}</Typography>
                  {Number(row.mrp) > 0 && Number(row.mrp) !== Number(row.sellingPrice) && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      MRP <s>{currency(row.mrp)}</s>
                    </Typography>
                  )}
                </Box>
              )},
              { field: 'unit', headerName: 'Unit / Conversion', render: (row) => (
                <Box>
                  <Typography variant="body2" fontWeight={600}>{row.primaryUnit || 'PCS'}</Typography>
                  {/* Written the way the stock engine applies it: one secondary
                      unit contains `factor` primary units. */}
                  {row.secondaryUnit && Number(row.unitConversionFactor) > 1 && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      1 {row.secondaryUnit} = {row.unitConversionFactor} {row.primaryUnit}
                    </Typography>
                  )}
                </Box>
              )},
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
          <Grid item xs={12} sm={6}><TextField fullWidth label="Product Name *" {...register('productName', { required: 'Product name is required' })} error={Boolean(errors.productName)} helperText={errors.productName?.message} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth select label="Category" defaultValue="" {...register('categoryId')} InputLabelProps={{ shrink: true }}>
              {categories.map((c) => <MenuItem value={c.id} key={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}><TextField fullWidth label="SKU" {...register('sku')} InputLabelProps={{ shrink: true }} helperText="Your own code for this item" /></Grid>
          <Grid item xs={12} sm={4}><TextField fullWidth label="HSN/SAC Code" {...register('hsnCode')} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={12} sm={4}><TextField fullWidth label="Barcode" {...register('barcode')} InputLabelProps={{ shrink: true }} /></Grid>

          {/* Pricing. MRP is the printed price; the tiers are what different
              kinds of customer actually pay. */}
          <Grid item xs={12}>
            <Box sx={{ p: 2, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: 'primary.main' }}>
                Pricing
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth type="number" label="Purchase Price (₹)" inputProps={{ min: 0, step: 'any' }}
                    {...register('purchasePrice')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth type="number" label="MRP (₹)" inputProps={{ min: 0, step: 'any' }}
                    {...register('mrp')} InputLabelProps={{ shrink: true }}
                    helperText="Printed price. Leave blank if the item has none." />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth type="number" label="Selling Price — Retail (₹)" inputProps={{ min: 0, step: 'any' }}
                    {...register('sellingPrice')} InputLabelProps={{ shrink: true }}
                    error={Number(formValues.mrp) > 0 && Number(formValues.sellingPrice) > Number(formValues.mrp)}
                    helperText={
                      Number(formValues.mrp) > 0 && Number(formValues.sellingPrice) > Number(formValues.mrp)
                        ? 'Cannot be more than the MRP'
                        : ' '
                    }
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth type="number" label="Wholesale Price (₹)" inputProps={{ min: 0, step: 'any' }}
                    {...register('wholesalePrice')} InputLabelProps={{ shrink: true }}
                    helperText="Blank falls back to retail" />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth type="number" label="Dealer Price (₹)" inputProps={{ min: 0, step: 'any' }}
                    {...register('dealerPrice')} InputLabelProps={{ shrink: true }}
                    helperText="Blank falls back to retail" />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth type="number" label="GST %" inputProps={{ min: 0, max: 100, step: 'any' }}
                    {...register('gstPercent')} InputLabelProps={{ shrink: true }} />
                </Grid>
                {Number(formValues.sellingPrice) > 0 && Number(formValues.purchasePrice) > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">
                      Margin at retail:{' '}
                      <strong>
                        {currency(Number(formValues.sellingPrice) - Number(formValues.purchasePrice))}
                        {' '}({(((Number(formValues.sellingPrice) - Number(formValues.purchasePrice)) / Number(formValues.purchasePrice)) * 100).toFixed(1)}%)
                      </strong>
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </Box>
          </Grid>

          {/* Stock levels and reordering. */}
          <Grid item xs={12}>
            <Box sx={{ p: 2, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: 'primary.main' }}>
                Stock & Reordering
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth type="number" label="Opening Stock" inputProps={{ min: 0, step: 'any' }}
                    {...register('stock')} InputLabelProps={{ shrink: true }}
                    helperText="At the current location" />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth type="number" label="Low Stock Alert At" inputProps={{ min: 0 }}
                    {...register('lowStockThreshold')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth type="number" label="Reorder Level" inputProps={{ min: 0 }}
                    {...register('reorderLevel')} InputLabelProps={{ shrink: true }}
                    helperText="Trigger to buy more" />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth type="number" label="Reorder Quantity" inputProps={{ min: 0 }}
                    {...register('reorderQuantity')} InputLabelProps={{ shrink: true }}
                    helperText="How much to buy" />
                </Grid>
              </Grid>
            </Box>
          </Grid>

          {/* Unit & Unit Conversion Section */}
          <Grid item xs={12}>
            <Box sx={{ p: 2, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: 'primary.main' }}>
                Unit Master & Unit Conversion
              </Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth select label="Primary Unit" defaultValue="PCS" {...register('primaryUnit')} InputLabelProps={{ shrink: true }}>
                    {units.map((u) => <MenuItem key={u.code} value={u.code}>{u.code} — {u.name}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth select label="Secondary Unit (Optional)" defaultValue="" {...register('secondaryUnit')} InputLabelProps={{ shrink: true }}>
                    <MenuItem value="">None (Single Unit)</MenuItem>
                    {units.map((u) => <MenuItem key={u.code} value={u.code}>{u.code} — {u.name}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth type="number" label="Conversion Factor"
                    placeholder="e.g. 10"
                    inputProps={{ min: 0, step: 'any' }}
                    {...register('unitConversionFactor')}
                    InputLabelProps={{ shrink: true }}
                    helperText="e.g. 1 BOX = 10 PCS"
                  />
                </Grid>
                {/* Stated in the direction the stock engine actually applies:
                    one secondary unit contains `factor` primary units. */}
                {formValues.secondaryUnit && Number(formValues.unitConversionFactor) > 1 && (
                  <Grid item xs={12}>
                    <Chip
                      label={`Conversion Rule: 1 ${formValues.secondaryUnit} = ${formValues.unitConversionFactor} ${formValues.primaryUnit || 'Unit'}`}
                      color="primary" variant="outlined" sx={{ fontWeight: 700 }}
                    />
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                      Stock is always counted in {formValues.primaryUnit || 'the primary unit'}. Selling
                      1 {formValues.secondaryUnit} removes {formValues.unitConversionFactor} {formValues.primaryUnit || 'units'} from the shelf.
                    </Typography>
                  </Grid>
                )}
                {formValues.secondaryUnit && !(Number(formValues.unitConversionFactor) > 1) && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="error.main">
                      A secondary unit needs a conversion factor greater than 1, or it converts nothing.
                    </Typography>
                  </Grid>
                )}
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth type="number" label={`Price per ${formValues.secondaryUnit || 'secondary unit'} (₹)`}
                    inputProps={{ min: 0, step: 'any' }}
                    disabled={!formValues.secondaryUnit}
                    {...register('secondarySellingPrice')}
                    InputLabelProps={{ shrink: true }}
                    helperText="Leave blank to charge the primary price × factor"
                  />
                </Grid>
              </Grid>
            </Box>
          </Grid>
          {/* Tracking is opt-in per product: a shop selling loose grain wants
              none of it, an electronics dealer wants serials on everything. */}
          <Grid item xs={12}>
            <Box sx={{ p: 2, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5, color: 'primary.main' }}>
                Tracking
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Turn these on only where they earn their keep — each one adds a step when receiving goods.
              </Typography>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={12} sm={3}>
                  <FormControlLabel control={<Switch {...register('batchRequired')} />} label="Batch / lot" />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <FormControlLabel control={<Switch {...register('expiryRequired')} />} label="Expiry date" />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <FormControlLabel control={<Switch {...register('serialRequired')} />} label="Serial numbers" />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth size="small" type="number" label="Warranty (months)" inputProps={{ min: 0 }}
                    {...register('warrantyMonths')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth size="small" label="Size" {...register('size')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth size="small" label="Colour" {...register('color')} InputLabelProps={{ shrink: true }} />
                </Grid>
              </Grid>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <FormControlLabel control={<Switch defaultChecked {...register('isActive')} />} label="Active for billing" />
          </Grid>
          <Grid item xs={12}>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button type="button" onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
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
