import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBasket';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import {
  Box, Button, Chip, Grid, IconButton, MenuItem, Paper,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import LineItems from '../components/LineItems.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import PeriodFilter from '../components/PeriodFilter.jsx';
import StatsCard from '../components/StatsCard.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { productsApi, purchasesApi, suppliersApi } from '../services/resource.service.js';
import { currency, date } from '../utils/formatters.js';

const blankItem = { productId: '', quantity: 1, rate: 0, gstPercent: 18 };
const PAYMENT_COLORS = { Paid: 'success', 'Partially Paid': 'warning', Unpaid: 'error' };
const STATUS_COLORS = { Received: 'success', Draft: 'default', Cancelled: 'error' };

function calc(items) {
  const subtotal = items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.rate || 0), 0);
  const tax = items.reduce((sum, it) => {
    const taxable = Number(it.quantity || 0) * Number(it.rate || 0);
    return sum + taxable * Number(it.gstPercent || 0) / 100;
  }, 0);
  return { subtotal, tax, grand: subtotal + tax };
}

export default function Purchases() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10 , period: 'thisMonth', from: '', to: '', month: '' });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([blankItem]);
  const [cancelling, setCancelling] = useState(null);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, control, formState: { isSubmitting } } = useForm({
    defaultValues: { purchaseDate: new Date().toISOString().slice(0, 10), supplierId: '', status: 'Received', paidAmount: 0, notes: '' },
  });
  const totals = useMemo(() => calc(items), [items]);

  const load = async () => {
    setLoading(true);
    try {
      const [result, sr, pr] = await Promise.all([
        purchasesApi.list(query),
        suppliersApi.list({ limit: 200 }),
        productsApi.list({ limit: 200 }),
      ]);
      setRows(result?.data || []); setMeta(result?.meta || {});
      setSuppliers(sr?.data || []); setProducts(pr?.data || []);
    } catch {
      setRows([]); setMeta({}); setSuppliers([]); setProducts([]);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const submit = async (values) => {
    const selected = items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (!selected.length) { showToast('Add at least one product with quantity > 0', 'error'); return; }
    const invalid = selected.find(it => Number(it.rate) < 0 || Number(it.gstPercent) < 0 || Number(it.gstPercent) > 100);
    if (invalid) { showToast('Invalid rate or GST percentage in line items', 'error'); return; }
    try {
      await purchasesApi.create({ ...values, items: selected });
      showToast('Purchase recorded and stock updated');
      setOpen(false); setItems([blankItem]); reset(); load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error saving purchase', 'error');
    }
  };

  const cancel = async () => {
    try {
      await purchasesApi.remove(cancelling.id);
      showToast('Purchase cancelled and stock reversed');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to cancel purchase', 'error');
    }
    setCancelling(null);
    load();
  };

  const handleUploadBill = async (e, id) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await purchasesApi.uploadAttachment(id, formData);
      showToast('Bill uploaded successfully');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to upload bill', 'error');
    }
  };

  const handleImportCsv = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await purchasesApi.importCsv(formData);
      showToast(`Imported ${result.imported} purchases. Failed: ${result.failed}`);
      if (result.errors?.length) {
        alert("Errors:\\n" + result.errors.join("\\n"));
      }
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to import CSV', 'error');
    }
    e.target.value = '';
  };

  const stats = useMemo(() => ({
    count: meta.total || rows.length,
    value: rows.reduce((sum, r) => sum + Number(r.grandTotal || 0), 0),
    unpaid: rows.filter((r) => r.paymentStatus !== 'Paid').length,
  }), [rows, meta]);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Purchases"
        subtitle="Record supplier purchases and bring stock into inventory"
        icon={<ShoppingBasketIcon />}
        action={
          <Stack direction="row" spacing={2}>
            <Button startIcon={<FileUploadIcon />} variant="outlined" component="label">
              Import CSV
              <input type="file" hidden accept=".csv" onChange={handleImportCsv} />
            </Button>
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
              New Purchase
            </Button>
          </Stack>
        }
      />

      <PeriodFilter
        value={query}
        onChange={(range) => setQuery({ ...query, ...range, page: 1 })}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} md={4}>
          <StatsCard title="Total Purchases" value={stats.count} detail="Recorded orders" icon={<ShoppingBasketIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={4}>
          <StatsCard title="Purchase Value" value={currency(stats.value)} detail="This page" icon={<ShoppingBasketIcon />} gradient="info" />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatsCard title="Outstanding" value={stats.unpaid} detail="Not fully paid" icon={<ShoppingBasketIcon />} gradient="warning" />
        </Grid>
      </Grid>

      {loading && rows.length === 0 ? <Loader /> : (
        <Box sx={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
        <>
          <DataTable
            mobileKeyField="purchaseNumber"
            columns={[
              { field: 'purchaseNumber', headerName: 'Purchase #', render: (r) => <Typography fontWeight={700} color="primary.main">{r.purchaseNumber}</Typography> },
              { field: 'purchaseDate', headerName: 'Date', render: (r) => date(r.purchaseDate) },
              { field: 'supplier', headerName: 'Supplier', render: (r) => r.Supplier?.supplierName || '—' },
              { field: 'status', headerName: 'Status', render: (r) => <Chip label={r.status} size="small" color={STATUS_COLORS[r.status] || 'default'} sx={{ fontWeight: 700, fontSize: '0.7rem' }} /> },
              { field: 'paymentStatus', headerName: 'Payment', render: (r) => <Chip label={r.paymentStatus} size="small" color={PAYMENT_COLORS[r.paymentStatus] || 'default'} variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} /> },
              { field: 'grandTotal', headerName: 'Total', render: (r) => <Typography fontWeight={800} color="success.main">{currency(r.grandTotal)}</Typography> },
              { field: 'actions', headerName: 'Actions', render: (r) => (
                <Stack direction="row" spacing={1}>
                  {r.attachmentMimeType ? (
                    <Tooltip title="View Bill">
                      <IconButton size="small" color="primary" sx={{ borderRadius: 1.5 }} component="a" href={`/api/purchases/${r.id}/attachment`} target="_blank">
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Upload Bill (PDF/Image)">
                      <IconButton size="small" color="info" sx={{ borderRadius: 1.5 }} component="label">
                        <CloudUploadIcon fontSize="small" />
                        <input type="file" hidden accept="image/*,.pdf" onChange={(e) => handleUploadBill(e, r.id)} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Cancel purchase">
                    <span>
                      <IconButton
                        size="small" color="error" sx={{ borderRadius: 1.5 }}
                        disabled={r.status === 'Cancelled'}
                        onClick={() => setCancelling(r)}
                      >
                        <CancelIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              )},
            ]}
            rows={rows}
            meta={meta}
          />
          <Pagination meta={meta} onChangePage={(p) => setQuery({ ...query, page: p })} onChangeLimit={(l) => setQuery({ ...query, limit: l })} />
        </>
        </Box>
      )}

      <Modal open={open} title="Record Purchase" onClose={() => setOpen(false)} maxWidth="lg">
        <Stack spacing={2.5} component="form" onSubmit={handleSubmit(submit)}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <Controller
                name="supplierId"
                control={control}
                rules={{ required: true }}
                render={({ field: { onChange, value } }) => (
                  <SearchableSelect
                    options={suppliers}
                    label="Supplier"
                    value={suppliers.find(s => String(s.id) === String(value)) || null}
                    onChange={(selectedOption) => onChange(selectedOption ? selectedOption.id : '')}
                    getOptionLabel={(option) => option.supplierName || ''}
                    getOptionKey={(option) => option.id}
                    required
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth type="date" label="Purchase Date" {...register('purchaseDate')} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField select fullWidth label="Status" defaultValue="Received" {...register('status')} InputLabelProps={{ shrink: true }}>
                <MenuItem value="Received">Received (adds stock)</MenuItem>
                <MenuItem value="Draft">Draft (no stock change)</MenuItem>
              </TextField>
            </Grid>
          </Grid>

          <LineItems items={items} onChange={setItems} products={products} fields={['rate', 'gstPercent']} showBatchFields={true} blank={blankItem} />

          <Grid container spacing={2}>
            <Grid item xs={12} md={7}>
              <TextField fullWidth label="Notes" multiline minRows={3} {...register('notes')} InputLabelProps={{ shrink: true }} />
              <TextField
                fullWidth type="number" label="Amount Paid" sx={{ mt: 2 }}
                inputProps={{ min: 0, step: 'any' }}
                {...register('paidAmount')} InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                    <Typography variant="body2" fontWeight={500}>{currency(totals.subtotal)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">GST</Typography>
                    <Typography variant="body2" fontWeight={500}>{currency(totals.tax)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Typography fontWeight={800}>Grand Total</Typography>
                    <Typography fontWeight={800} color="primary.main">{currency(totals.grand)}</Typography>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button type="button" onClick={() => setOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2, minWidth: 140 }}>
              {isSubmitting ? 'Saving…' : 'Save Purchase'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancel Purchase"
        message={`Cancel "${cancelling?.purchaseNumber}"? Any stock it added will be removed from inventory.`}
        onCancel={() => setCancelling(null)}
        onConfirm={cancel}
      />
    </Stack>
  );
}
