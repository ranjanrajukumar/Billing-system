import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import ShareIcon from '@mui/icons-material/Share';
import DeleteIcon from '@mui/icons-material/Delete';
import { Button, Grid, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../services/api.js';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import Pagination from '../components/Pagination.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { customersApi, salesOrdersApi, productsApi } from '../services/resource.service.js';
import { currency, date } from '../utils/formatters.js';

const blankItem = { productId: '', quantity: 1, rate: 0, discount: 0, gstPercent: 18 };

function calculate(items) {
  const subtotal = items.reduce((sum, item) => sum + Math.max(Number(item.quantity || 0) * Number(item.rate || 0) - Number(item.discount || 0), 0), 0);
  const tax = items.reduce((sum, item) => {
    const taxable = Math.max(Number(item.quantity || 0) * Number(item.rate || 0) - Number(item.discount || 0), 0);
    return sum + taxable * Number(item.gstPercent || 0) / 100;
  }, 0);
  const grand = Math.round(subtotal + tax);
  return { subtotal, cgst: tax / 2, sgst: tax / 2, igst: 0, grand, roundOff: grand - subtotal - tax };
}

export default function SalesOrders() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([blankItem]);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({ defaultValues: { orderDate: new Date().toISOString().slice(0, 10), customerId: '', status: 'Cash', notes: '' } });
  const totals = useMemo(() => calculate(items), [items]);

  const load = async () => {
    setLoading(true);
    const [result, customerResult, productResult] = await Promise.all([
      salesOrdersApi.list(query),
      customersApi.list({ limit: 100 }),
      productsApi.list({ limit: 100 })
    ]);
    setRows(result.data);
    setMeta(result.meta);
    setCustomers(customerResult.data);
    setProducts(productResult.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const setItem = (index, patch) => setItems((prev) => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
  const chooseProduct = (index, productId) => {
    const product = products.find((p) => p.id === Number(productId));
    setItem(index, { productId, rate: product?.sellingPrice || 0, gstPercent: product?.gstPercent || 0 });
  };
  const submit = async (values) => {
    await salesOrdersApi.create({ ...values, items });
    showToast('Sales Order saved');
    setOpen(false);
    setItems([blankItem]);
    reset();
    load();
  };
  const download = async (id) => {
    const blob = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Typography variant="h4">SalesOrders</Typography>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>New Sales Order</Button>
      </Stack>
      {loading ? <Loader /> : <><DataTable columns={[
        { field: 'orderNumber', headerName: 'Sales Order' },
        { field: 'orderDate', headerName: 'Date', render: (row) => date(row.orderDate) },
        { field: 'customer', headerName: 'Customer', render: (row) => row.Customer?.customerName },
        { field: 'status', headerName: 'Status' },
        { field: 'totalAmount', headerName: 'Total', render: (row) => currency(row.totalAmount) },
        { field: 'actions', headerName: 'Actions', render: (row) => <><IconButton onClick={() => download(row.id)}><DownloadIcon /></IconButton><IconButton onClick={() => window.print()}><PrintIcon /></IconButton><IconButton><ShareIcon /></IconButton></> }
      ]} rows={rows} /><Pagination meta={meta} onChangePage={(page) => setQuery({ ...query, page })} onChangeLimit={(limit) => setQuery({ ...query, limit })} /></>}
      <Modal open={open} title="Create Sales Order" onClose={() => setOpen(false)} maxWidth="lg">
        <Stack spacing={2} component="form" onSubmit={handleSubmit(submit)} sx={{ pt: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}><TextField fullWidth type="date" label="Sales Order Date" InputLabelProps={{ shrink: true }} {...register('orderDate', { required: true })} /></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth select label="Customer" {...register('customerId', { required: true })}>{customers.map((c) => <MenuItem value={c.id} key={c.id}>{c.customerName}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth select label="Status" {...register('status')}>{['Pending', 'Approved', 'Shipped', 'Delivered', 'Cancelled'].map((m) => <MenuItem value={m} key={m}>{m}</MenuItem>)}</TextField></Grid>
          </Grid>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1}>
              {items.map((item, index) => (
                <Grid container spacing={1} key={index} alignItems="center">
                  <Grid item xs={12} md={4}><TextField fullWidth select size="small" label="Product" value={item.productId} onChange={(e) => chooseProduct(index, e.target.value)}>{products.map((p) => <MenuItem value={p.id} key={p.id}>{p.productName} ({p.stock})</MenuItem>)}</TextField></Grid>
                  {['quantity', 'rate', 'discount', 'gstPercent'].map((name) => <Grid item xs={6} md={1.6} key={name}><TextField fullWidth size="small" type="number" label={name} value={item[name]} onChange={(e) => setItem(index, { [name]: e.target.value })} /></Grid>)}
                  <Grid item xs={6} md={1}><IconButton color="error" onClick={() => setItems(items.filter((_, i) => i !== index))}><DeleteIcon /></IconButton></Grid>
                </Grid>
              ))}
              <Button startIcon={<AddIcon />} onClick={() => setItems([...items, blankItem])}>Add Product</Button>
            </Stack>
          </Paper>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}><TextField fullWidth multiline minRows={3} label="Notes" {...register('notes')} /></Grid>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography>Subtotal: {currency(totals.subtotal)}</Typography>
                <Typography>CGST: {currency(totals.cgst)}</Typography>
                <Typography>SGST: {currency(totals.sgst)}</Typography>
                <Typography>IGST: {currency(totals.igst)}</Typography>
                <Typography>Round Off: {currency(totals.roundOff)}</Typography>
                <Typography variant="h6">Grand Total: {currency(totals.grand)}</Typography>
              </Paper>
            </Grid>
          </Grid>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button type="submit" variant="contained" disabled={isSubmitting}>Save Sales Order</Button><Button onClick={() => window.print()} startIcon={<PrintIcon />}>Print Sales Order</Button></Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
