import { Button, Grid, IconButton, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import AddIcon from '@mui/icons-material/Add';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import Pagination from '../components/Pagination.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { productsApi, inventoryApi } from '../services/resource.service.js';
import { date } from '../utils/formatters.js';

export default function Inventory() {
  const [tab, setTab] = useState(0);
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  const load = async () => {
    setLoading(true);
    if (tab === 0) {
      const result = await productsApi.list({ ...query, limit: 100 });
      setProducts(result.data);
    } else {
      const result = await inventoryApi.movements(query);
      setMovements(result.data);
      setMeta(result.meta);
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
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
        <Typography variant="h4">Inventory Management</Typography>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>Adjust Stock</Button>
      </Stack>
      
      <Paper sx={{ width: '100%' }}>
        <Tabs value={tab} onChange={(_, v) => { setTab(v); setQuery({ page: 1, limit: 10 }); }} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Current Stock" />
          <Tab label="Stock Movements (History)" />
        </Tabs>
        
        {loading ? <Loader /> : (
          tab === 0 ? (
            <DataTable columns={[
              { field: 'barcode', headerName: 'Barcode' },
              { field: 'productName', headerName: 'Product Name' },
              { field: 'stock', headerName: 'Current Stock', render: (row) => (
                <Typography color={row.stock <= row.lowStockThreshold ? 'error.main' : 'text.primary'} fontWeight={row.stock <= row.lowStockThreshold ? 'bold' : 'normal'}>
                  {row.stock}
                </Typography>
              )},
              { field: 'lowStockThreshold', headerName: 'Low Stock At' }
            ]} rows={products} />
          ) : (
            <>
              <DataTable columns={[
                { field: 'addondt', headerName: 'Date', render: (row) => date(row.addondt) },
                { field: 'product', headerName: 'Product', render: (row) => row.Product?.productName },
                { field: 'movementType', headerName: 'Type', render: (row) => (
                  <Typography color={['Purchase', 'Adjustment In', 'Opening Stock'].includes(row.movementType) ? 'success.main' : 'error.main'}>
                    {row.movementType}
                  </Typography>
                )},
                { field: 'quantity', headerName: 'Quantity', render: (row) => (row.quantity > 0 ? '+' : '') + row.quantity },
                { field: 'referenceType', headerName: 'Source' },
                { field: 'stockUser', headerName: 'User', render: (row) => row.stockUser?.name },
                { field: 'notes', headerName: 'Notes' }
              ]} rows={movements} />
              <Pagination meta={meta} onChangePage={(page) => setQuery({ ...query, page })} onChangeLimit={(limit) => setQuery({ ...query, limit })} />
            </>
          )
        )}
      </Paper>

      <Modal open={open} title="Adjust Stock" onClose={() => setOpen(false)}>
        <Stack spacing={2} component="form" onSubmit={handleSubmit(submit)} sx={{ pt: 1 }}>
          <TextField select fullWidth label="Product" {...register('productId', { required: true })}>
            {products.map((p) => <MenuItem key={p.id} value={p.id}>{p.productName} (Cur: {p.stock})</MenuItem>)}
          </TextField>
          <TextField select fullWidth label="Adjustment Type" {...register('type', { required: true })}>
            <MenuItem value="Opening Stock">Opening Stock (+)</MenuItem>
            <MenuItem value="Adjustment In">Adjustment In (+)</MenuItem>
            <MenuItem value="Adjustment Out">Adjustment Out (-)</MenuItem>
          </TextField>
          <TextField fullWidth type="number" label="Quantity" {...register('quantity', { required: true, min: 1 })} />
          <TextField fullWidth multiline minRows={2} label="Notes / Reason" {...register('notes', { required: true })} />
          <Button type="submit" variant="contained" disabled={isSubmitting}>Save Adjustment</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
