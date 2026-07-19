import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { Button, Grid, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../services/api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import Pagination from '../components/Pagination.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { productsApi } from '../services/resource.service.js';
import { currency } from '../utils/formatters.js';

const empty = { productName: '', categoryId: '', hsnCode: '', purchasePrice: 0, sellingPrice: 0, gstPercent: 18, stock: 0, barcode: '', lowStockThreshold: 5 };

export default function Products() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: empty });

  const load = async () => {
    setLoading(true);
    const [result, cats] = await Promise.all([productsApi.list(query), api.get('/products/categories').then((r) => r.data)]);
    setRows(result.data);
    setMeta(result.meta);
    setCategories(cats);
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const openForm = (row = null) => { setEditing(row || {}); reset(row ? { ...row, categoryId: row.categoryId || '' } : empty); };
  const submit = async (values) => {
    const payload = { ...values, categoryId: values.categoryId || null };
    editing.id ? await productsApi.update(editing.id, payload) : await productsApi.create(payload);
    showToast('Product saved');
    setEditing(null);
    load();
  };
  const remove = async () => { await productsApi.remove(deleting.id); showToast('Product deleted'); setDeleting(null); load(); };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Typography variant="h4">Products</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><SearchBox value={query.search} onChange={(search) => setQuery({ ...query, search, page: 1 })} /><Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>Add</Button></Stack>
      </Stack>
      {loading ? <Loader /> : <><DataTable columns={[
        { field: 'productName', headerName: 'Product' },
        { field: 'category', headerName: 'Category', render: (row) => row.Category?.name },
        { field: 'hsnCode', headerName: 'HSN' },
        { field: 'sellingPrice', headerName: 'Price', render: (row) => currency(row.sellingPrice) },
        { field: 'gstPercent', headerName: 'GST %' },
        { field: 'stock', headerName: 'Stock' },
        { field: 'actions', headerName: 'Actions', render: (row) => <><IconButton onClick={() => openForm(row)}><EditIcon /></IconButton><IconButton color="error" onClick={() => setDeleting(row)}><DeleteIcon /></IconButton></> }
      ]} rows={rows} /><Pagination meta={meta} onChangePage={(page) => setQuery({ ...query, page })} onChangeLimit={(limit) => setQuery({ ...query, limit })} /></>}
      <Modal open={Boolean(editing)} title={editing?.id ? 'Update Product' : 'Add Product'} onClose={() => setEditing(null)}>
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)} sx={{ pt: 1 }}>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Product Name" {...register('productName', { required: 'Required' })} error={Boolean(errors.productName)} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth select label="Category" defaultValue="" {...register('categoryId')}>{categories.map((c) => <MenuItem value={c.id} key={c.id}>{c.name}</MenuItem>)}</TextField></Grid>
          {['hsnCode', 'purchasePrice', 'sellingPrice', 'gstPercent', 'stock', 'barcode', 'lowStockThreshold'].map((name) => (
            <Grid item xs={12} sm={6} key={name}><TextField fullWidth type={['purchasePrice', 'sellingPrice', 'gstPercent', 'stock', 'lowStockThreshold'].includes(name) ? 'number' : 'text'} label={name.replace(/([A-Z])/g, ' $1')} {...register(name, { required: !['barcode'].includes(name) && 'Required' })} /></Grid>
          ))}
          <Grid item xs={12}><Button type="submit" variant="contained" disabled={isSubmitting}>Save Product</Button></Grid>
        </Grid>
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} message={`Delete ${deleting?.productName}?`} onCancel={() => setDeleting(null)} onConfirm={remove} />
    </Stack>
  );
}
