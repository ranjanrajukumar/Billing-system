import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import {
  Box, Button, Chip, Grid, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import SearchBox from '../components/SearchBox.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';
import { currency, date } from '../utils/formatters.js';

const empty = {
  code: '', description: '', discountType: 'Percentage', discountValue: '',
  maxDiscount: '', minOrderValue: 0, validFrom: '', validTo: '',
  usageLimit: '', perCustomerLimit: '', isActive: true,
};

const isExpired = (c) => c.validTo && c.validTo < new Date().toISOString().slice(0, 10);
const isExhausted = (c) => c.usageLimit != null && Number(c.usedCount) >= Number(c.usageLimit);

export default function Coupons() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({ defaultValues: empty });
  const discountType = watch('discountType');

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get('/coupons', { params: query }).then((r) => r.data);
      setRows(result?.data || []);
      setMeta(result?.meta || {});
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load coupons', 'error');
      setRows([]); setMeta({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const openForm = (row = null) => {
    setEditing(row || {});
    reset(row ? { ...empty, ...row } : empty);
  };

  const submit = async (values) => {
    // Blank optional numbers must be null, not '', or validation rejects them.
    const payload = { ...values };
    for (const key of ['maxDiscount', 'usageLimit', 'perCustomerLimit', 'validFrom', 'validTo']) {
      if (payload[key] === '' || payload[key] == null) delete payload[key];
    }
    try {
      if (editing.id) await api.put(`/coupons/${editing.id}`, payload);
      else await api.post('/coupons', payload);
      showToast('Coupon saved');
      setEditing(null);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save coupon';
      const details = err.response?.data?.errors?.map((e) => `${e.path || e.param}: ${e.msg}`).join(', ');
      showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/coupons/${deleting.id}`);
      showToast('Coupon deleted');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to delete coupon', 'error');
    }
    setDeleting(null);
    load();
  };

  const active = rows.filter((c) => c.isActive && !isExpired(c) && !isExhausted(c)).length;

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Coupons"
        subtitle="Discount codes applied at billing, before GST is calculated"
        icon={<LocalOfferIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <SearchBox value={query.search} onChange={(search) => setQuery({ ...query, search, page: 1 })} placeholder="Search coupons…" />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>Add Coupon</Button>
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={6} md={4}>
          <StatsCard title="Total Coupons" value={meta.total || rows.length} detail="All codes" icon={<LocalOfferIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={4}>
          <StatsCard title="Usable Now" value={active} detail="Active and in date" icon={<LocalOfferIcon />} gradient="success" />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatsCard title="Times Used" value={rows.reduce((s, c) => s + Number(c.usedCount || 0), 0)} detail="This page" icon={<LocalOfferIcon />} gradient="info" />
        </Grid>
      </Grid>

      {loading && rows.length === 0 ? <Loader /> : (
        <Box sx={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
        <>
          <DataTable
            mobileKeyField="code"
            rows={rows}
            meta={meta}
            columns={[
              { field: 'code', headerName: 'Code', render: (r) => (
                <Chip label={r.code} size="small" color="primary" sx={{ fontWeight: 800, fontFamily: 'monospace' }} />
              )},
              { field: 'description', headerName: 'Description', render: (r) => r.description || '—' },
              { field: 'discountValue', headerName: 'Discount', render: (r) => (
                <Typography fontWeight={700}>
                  {r.discountType === 'Percentage' ? `${Number(r.discountValue)}%` : currency(r.discountValue)}
                  {r.maxDiscount ? ` (max ${currency(r.maxDiscount)})` : ''}
                </Typography>
              )},
              { field: 'minOrderValue', headerName: 'Min Order', render: (r) => (Number(r.minOrderValue) ? currency(r.minOrderValue) : '—') },
              { field: 'validTo', headerName: 'Valid Until', render: (r) => (r.validTo ? date(r.validTo) : 'No expiry') },
              { field: 'usedCount', headerName: 'Used', render: (r) => `${r.usedCount}${r.usageLimit ? ` / ${r.usageLimit}` : ''}` },
              { field: 'isActive', headerName: 'Status', render: (r) => {
                if (!r.isActive) return <Chip label="Inactive" size="small" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
                if (isExpired(r)) return <Chip label="Expired" size="small" color="error" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
                if (isExhausted(r)) return <Chip label="Used up" size="small" color="warning" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
                return <Chip label="Active" size="small" color="success" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
              }},
              { field: 'actions', headerName: 'Actions', render: (r) => (
                <Stack direction="row" spacing={0.25}>
                  <Tooltip title="Edit">
                    <IconButton size="small" color="primary" onClick={() => openForm(r)} sx={{ borderRadius: 1.5 }}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleting(r)} sx={{ borderRadius: 1.5 }}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </Stack>
              )},
            ]}
          />
          <Pagination meta={meta} onChangePage={(p) => setQuery({ ...query, page: p })} onChangeLimit={(l) => setQuery({ ...query, limit: l, page: 1 })} />
        </>
        </Box>
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Update Coupon' : 'Add Coupon'} onClose={() => setEditing(null)} maxWidth="sm">
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth label="Code" placeholder="DIWALI10"
              {...register('code', { required: 'Required' })}
              error={Boolean(errors.code)} helperText={errors.code?.message || 'Saved in capitals'}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField select fullWidth label="Discount Type" defaultValue="Percentage" {...register('discountType')} InputLabelProps={{ shrink: true }}>
              <MenuItem value="Percentage">Percentage</MenuItem>
              <MenuItem value="Fixed">Fixed amount</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Description" {...register('description')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth type="number" label={discountType === 'Percentage' ? 'Percent off' : 'Amount off'}
              inputProps={{ min: 0, step: 'any' }}
              {...register('discountValue', { required: 'Required' })}
              error={Boolean(errors.discountValue)} helperText={errors.discountValue?.message}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth type="number" label="Maximum discount"
              inputProps={{ min: 0, step: 'any' }}
              helperText={discountType === 'Percentage' ? 'Caps a percentage coupon' : 'Not needed for fixed amounts'}
              disabled={discountType !== 'Percentage'}
              {...register('maxDiscount')} InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="number" label="Minimum order" inputProps={{ min: 0, step: 'any' }} {...register('minOrderValue')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth type="date" label="Valid from" {...register('validFrom')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth type="date" label="Valid until" {...register('validTo')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6}>
            <TextField fullWidth type="number" label="Total uses allowed" inputProps={{ min: 1 }} helperText="Blank = unlimited" {...register('usageLimit')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6}>
            <TextField fullWidth type="number" label="Uses per customer" inputProps={{ min: 1 }} helperText="Blank = unlimited" {...register('perCustomerLimit')} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
              <Button type="button" onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2 }}>
                {isSubmitting ? 'Saving…' : editing?.id ? 'Update Coupon' : 'Add Coupon'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Coupon"
        message={`Delete "${deleting?.code}"? Invoices that already used it are unaffected.`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
