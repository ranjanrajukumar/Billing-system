import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import EmailIcon from '@mui/icons-material/Email';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import {
  alpha, Avatar, Box, Button, Chip, Grid,
  IconButton, Stack, TextField, Tooltip, Typography, useTheme,
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
import { suppliersApi } from '../services/resource.service.js';

const empty = {
  supplierName: '', contactPerson: '', mobileNumber: '', email: '',
  gstNumber: '', address: '', city: '', state: '', pincode: '',
};

const fields = [
  { name: 'supplierName', label: 'Supplier Name', required: true, sm: 6 },
  { name: 'contactPerson', label: 'Contact Person', sm: 6 },
  { name: 'mobileNumber', label: 'Mobile Number', required: true, sm: 6 },
  { name: 'email', label: 'Email Address', type: 'email', sm: 6 },
  { name: 'gstNumber', label: 'GST Number', sm: 6 },
  { name: 'pincode', label: 'Pincode', sm: 6 },
  { name: 'address', label: 'Address', sm: 12, multiline: true },
  { name: 'city', label: 'City', sm: 6 },
  { name: 'state', label: 'State', sm: 6 },
];

function SupplierAvatar({ name, size = 36 }) {
  const initials = name ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : '?';
  const colors = ['#0891b2', '#059669', '#d97706', '#7c3aed', '#dc2626', '#4f46e5'];
  const color = colors[name ? name.charCodeAt(0) % colors.length : 0];
  return (
    <Avatar sx={{ width: size, height: size, bgcolor: color, fontSize: size * 0.35, fontWeight: 700 }}>
      {initials}
    </Avatar>
  );
}

export default function Suppliers() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const theme = useTheme();
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: empty });

  const load = async () => {
    setLoading(true);
    try {
      const result = await suppliersApi.list(query);
      setRows(result?.data || []);
      setMeta(result?.meta || {});
    } catch {
      setRows([]);
      setMeta({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const openForm = (row = null) => { setEditing(row || {}); reset(row || empty); };

  const submit = async (values) => {
    try {
      editing.id ? await suppliersApi.update(editing.id, values) : await suppliersApi.create(values);
      showToast('Supplier saved');
      setEditing(null);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save supplier';
      const details = err.response?.data?.errors?.map((e) => `${e.path || e.param}: ${e.msg}`).join(', ');
      showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };

  const remove = async () => {
    try {
      await suppliersApi.remove(deleting.id);
      showToast('Supplier deleted');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete supplier', 'error');
    }
    setDeleting(null);
    load();
  };

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Supplier Management"
        subtitle="Manage vendors used for purchase orders and stock replenishment"
        icon={<LocalShippingIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <SearchBox value={query.search} onChange={(search) => setQuery({ ...query, search, page: 1 })} placeholder="Search suppliers…" />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>
              Add Supplier
            </Button>
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={6} md={4}>
          <StatsCard title="Total Suppliers" value={meta.total || rows.length} detail="Registered vendors" icon={<LocalShippingIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={4}>
          <StatsCard title="With GST" value={rows.filter((r) => r.gstNumber).length} detail="Registered for GST" icon={<LocalShippingIcon />} gradient="info" />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatsCard title="This Page" value={rows.length} detail="Showing now" icon={<LocalShippingIcon />} gradient="success" />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <>
          <DataTable
            mobileKeyField="supplierName"
            columns={[
              { field: 'avatar', headerName: '', render: (row) => <SupplierAvatar name={row.supplierName} /> },
              { field: 'supplierName', headerName: 'Supplier', render: (row) => (
                <Box>
                  <Typography fontWeight={700} variant="body2">{row.supplierName}</Typography>
                  <Typography variant="caption" color="text.secondary">{row.contactPerson || row.mobileNumber}</Typography>
                </Box>
              )},
              { field: 'mobileNumber', headerName: 'Mobile' },
              { field: 'email', headerName: 'Email', render: (row) => row.email
                ? <Stack direction="row" spacing={0.5} alignItems="center"><EmailIcon sx={{ fontSize: 14, color: 'text.secondary' }} /><Typography variant="body2">{row.email}</Typography></Stack>
                : <Typography variant="caption" color="text.disabled">—</Typography>
              },
              { field: 'gstNumber', headerName: 'GST', render: (row) => row.gstNumber
                ? <Chip label={row.gstNumber} size="small" variant="outlined" color="primary" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }} />
                : <Typography variant="caption" color="text.disabled">—</Typography>
              },
              { field: 'city', headerName: 'Location', render: (row) => (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="body2">{[row.city, row.state].filter(Boolean).join(', ') || '—'}</Typography>
                </Stack>
              )},
              { field: 'actions', headerName: 'Actions', render: (row) => (
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => openForm(row)} sx={{ borderRadius: 1.5, color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.08) }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleting(row)} sx={{ borderRadius: 1.5, bgcolor: alpha(theme.palette.error.main, 0.08) }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )},
            ]}
            rows={rows}
            meta={meta}
          />
          <Pagination meta={meta} onChangePage={(p) => setQuery({ ...query, page: p })} onChangeLimit={(l) => setQuery({ ...query, limit: l })} />
        </>
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Update Supplier' : 'Add Supplier'} onClose={() => setEditing(null)}>
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)}>
          {fields.map((f) => (
            <Grid item xs={12} sm={f.sm} key={f.name}>
              <TextField
                fullWidth label={f.label} type={f.type || 'text'}
                multiline={f.multiline} minRows={f.multiline ? 3 : undefined}
                {...register(f.name, { required: f.required && 'Required' })}
                error={Boolean(errors[f.name])} helperText={errors[f.name]?.message}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          ))}
          <Grid item xs={12}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2 }}>
                {isSubmitting ? 'Saving…' : editing?.id ? 'Update Supplier' : 'Add Supplier'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Supplier"
        message={`Are you sure you want to delete "${deleting?.supplierName}"?`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
