import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import ShareIcon from '@mui/icons-material/Share';
import DeleteIcon from '@mui/icons-material/Delete';
import CancelIcon from '@mui/icons-material/Cancel';
import EmailIcon from '@mui/icons-material/Email';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { Button, Grid, IconButton, Menu, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../services/api.js';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import Pagination from '../components/Pagination.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { customersApi, invoicesApi, productsApi } from '../services/resource.service.js';
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

function DownloadMenu({ id }) {
  const [anchorEl, setAnchorEl] = useState(null);
  
  const download = async (template) => {
    setAnchorEl(null);
    const blob = await api.get(`/invoices/${id}/pdf?template=${template}`, { responseType: 'blob' }).then((r) => r.data);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <>
      <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}><DownloadIcon /></IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => download('')}>Download Default Format</MenuItem>
        <MenuItem onClick={() => download('standard')}>Download Standard Format</MenuItem>
        <MenuItem onClick={() => download('modern')}>Download Modern Format</MenuItem>
        <MenuItem onClick={() => download('compact')}>Download Compact Format</MenuItem>
        <MenuItem onClick={() => download('premium')}>Download Premium (Dark Blue)</MenuItem>
        <MenuItem onClick={() => download('thermal')}>Download Thermal (80mm)</MenuItem>
      </Menu>
    </>
  );
}

function ShareMenu({ row }) {
  const [anchorEl, setAnchorEl] = useState(null);

  const share = (method) => {
    setAnchorEl(null);
    const text = `Hello ${row.Customer?.customerName}, here is your Invoice ${row.invoiceNumber} for amount ${currency(row.grandTotal)}.`;
    if (method === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      window.location.href = `mailto:?subject=Invoice ${row.invoiceNumber}&body=${encodeURIComponent(text)}`;
    }
  };

  return (
    <>
      <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}><ShareIcon /></IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => share('whatsapp')}><WhatsAppIcon sx={{ mr: 1, color: '#25D366' }} /> WhatsApp</MenuItem>
        <MenuItem onClick={() => share('email')}><EmailIcon sx={{ mr: 1, color: '#EA4335' }} /> Email</MenuItem>
      </Menu>
    </>
  );
}

export default function Invoices() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([blankItem]);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({ defaultValues: { invoiceDate: new Date().toISOString().slice(0, 10), customerId: '', paymentMethod: 'Cash', notes: '' } });
  const totals = useMemo(() => calculate(items), [items]);

  const load = async () => {
    setLoading(true);
    const [result, customerResult, productResult] = await Promise.all([
      invoicesApi.list(query),
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
    await invoicesApi.create({ ...values, items });
    showToast('Invoice saved');
    setOpen(false);
    setItems([blankItem]);
    reset();
    load();
  };

  const cancelInvoice = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this invoice? Stock will be reversed.')) return;
    try {
      await api.delete(`/invoices/${id}`);
      showToast('Invoice cancelled and stock reversed');
      load();
    } catch (e) {
      showToast('Failed to cancel invoice', 'error');
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Typography variant="h4">Invoices</Typography>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>New Invoice</Button>
      </Stack>
      {loading ? <Loader /> : <><DataTable columns={[
        { field: 'invoiceNumber', headerName: 'Invoice' },
        { field: 'invoiceDate', headerName: 'Date', render: (row) => date(row.invoiceDate) },
        { field: 'customer', headerName: 'Customer', render: (row) => row.Customer?.customerName },
        { field: 'paymentMethod', headerName: 'Payment' },
        { field: 'grandTotal', headerName: 'Total', render: (row) => currency(row.grandTotal) },
        { field: 'actions', headerName: 'Actions', render: (row) => (
          <>
            <DownloadMenu id={row.id} />
            <IconButton onClick={() => window.print()}><PrintIcon /></IconButton>
            <ShareMenu row={row} />
            <IconButton color="error" onClick={() => cancelInvoice(row.id)} title="Cancel Invoice"><CancelIcon /></IconButton>
          </>
        )}
      ]} rows={rows} /><Pagination meta={meta} onChangePage={(page) => setQuery({ ...query, page })} onChangeLimit={(limit) => setQuery({ ...query, limit })} /></>}
      <Modal open={open} title="Create Invoice" onClose={() => setOpen(false)} maxWidth="lg">
        <Stack spacing={2} component="form" onSubmit={handleSubmit(submit)} sx={{ pt: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}><TextField fullWidth type="date" label="Invoice Date" InputLabelProps={{ shrink: true }} {...register('invoiceDate', { required: true })} /></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth select label="Customer" {...register('customerId', { required: true })}>{customers.map((c) => <MenuItem value={c.id} key={c.id}>{c.customerName}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth select label="Payment Method" {...register('paymentMethod')}>{['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit'].map((m) => <MenuItem value={m} key={m}>{m}</MenuItem>)}</TextField></Grid>
          </Grid>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1}>
              {items.map((item, index) => (
                <Grid container spacing={1} key={index} alignItems="center">
                  <Grid item xs={12} md={4}><TextField fullWidth select size="small" label="Product" value={item.productId} onChange={(e) => chooseProduct(index, e.target.value)}>{products.map((p) => <MenuItem value={p.id} key={p.id}>{p.productName} ({p.stock}) - HSN: {p.hsnCode}</MenuItem>)}</TextField></Grid>
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
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button type="submit" variant="contained" disabled={isSubmitting}>Save Invoice</Button><Button onClick={() => window.print()} startIcon={<PrintIcon />}>Print Invoice</Button></Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
