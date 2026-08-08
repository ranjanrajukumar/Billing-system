import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PeopleIcon from '@mui/icons-material/People';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import {
  alpha, Avatar, Box, Button, Chip, Divider, Grid,
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
import { customersApi } from '../services/resource.service.js';

const empty = {
  customerName: '', mobileNumber: '', email: '', gstNumber: '',
  address: '', city: '', state: '', pincode: '',
};

function CustomerAvatar({ name, size = 36 }) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const colors = ['#4f46e5', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626'];
  const color = colors[name ? name.charCodeAt(0) % colors.length : 0];
  return (
    <Avatar sx={{ width: size, height: size, bgcolor: color, fontSize: size * 0.35, fontWeight: 700 }}>
      {initials}
    </Avatar>
  );
}

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const theme = useTheme();
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: empty });

  const load = async () => {
    setLoading(true);
    try {
      const result = await customersApi.list(query);
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
      editing.id ? await customersApi.update(editing.id, values) : await customersApi.create(values);
      showToast('Customer saved');
      setEditing(null);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save customer';
      const details = err.response?.data?.errors?.map((e) => `${e.path || e.param}: ${e.msg}`).join(', ');
      showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };
  const viewDetails = async (row) => { const c = await customersApi.get(row.id); setViewing(c); };
  const remove = async () => {
    await customersApi.remove(deleting.id);
    showToast('Customer deleted');
    setDeleting(null);
    load();
  };

  const fields = [
    { name: 'customerName', label: 'Customer Name', required: true, sm: 6 },
    { name: 'mobileNumber', label: 'Mobile Number', required: true, sm: 6 },
    { name: 'email', label: 'Email Address', type: 'email', sm: 6 },
    { name: 'gstNumber', label: 'GST Number', sm: 6 },
    { name: 'address', label: 'Address', sm: 12, multiline: true },
    { name: 'city', label: 'City', sm: 4 },
    { name: 'state', label: 'State', sm: 4 },
    { name: 'pincode', label: 'Pincode', sm: 4 },
  ];

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Customer Management"
        subtitle="Manage customer details for billing, GST invoices, and sales records"
        icon={<PeopleIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <SearchBox value={query.search} onChange={(search) => setQuery({ ...query, search, page: 1 })} placeholder="Search customers…" />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>
              Add Customer
            </Button>
          </Stack>
        }
      />

      {/* Stats */}
      <Grid container spacing={2}>
        <Grid item xs={6} md={4}>
          <StatsCard title="Total Customers" value={meta.total || rows.length} detail="Registered accounts" icon={<PeopleIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={4}>
          <StatsCard title="With GST" value={rows.filter((r) => r.gstNumber).length} detail="B2B customers" icon={<PeopleIcon />} gradient="info" />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatsCard title="This Page" value={rows.length} detail="Showing now" icon={<PeopleIcon />} gradient="success" />
        </Grid>
      </Grid>

      {/* Table */}
      {loading ? <Loader /> : (
        <>
          <DataTable
            mobileKeyField="customerName"
            columns={[
              { field: 'avatar', headerName: '', render: (row) => <CustomerAvatar name={row.customerName} /> },
              { field: 'customerName', headerName: 'Customer', render: (row) => (
                <Box>
                  <Typography fontWeight={700} variant="body2">{row.customerName}</Typography>
                  <Typography variant="caption" color="text.secondary">{row.mobileNumber}</Typography>
                </Box>
              )},
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
                  <Tooltip title="View details">
                    <IconButton size="small" onClick={() => viewDetails(row)} sx={{ borderRadius: 1.5, color: 'info.main', bgcolor: alpha(theme.palette.info.main, 0.08), '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.15) } }}>
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => openForm(row)} sx={{ borderRadius: 1.5, color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.08), '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.15) } }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleting(row)} sx={{ borderRadius: 1.5, bgcolor: alpha(theme.palette.error.main, 0.08), '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.15) } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )},
            ]}
            rows={rows}
          />
          <Pagination meta={meta} onChangePage={(p) => setQuery({ ...query, page: p })} onChangeLimit={(l) => setQuery({ ...query, limit: l })} />
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal open={Boolean(editing)} title={editing?.id ? 'Update Customer' : 'Add Customer'} onClose={() => setEditing(null)}>
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
                {isSubmitting ? 'Saving…' : editing?.id ? 'Update Customer' : 'Add Customer'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Modal>

      {/* Detail View Modal */}
      <Modal open={Boolean(viewing)} title="Customer Profile" onClose={() => setViewing(null)} maxWidth="sm">
        {viewing && (
          <Stack spacing={2.5}>
            {/* Header */}
            <Stack direction="row" spacing={2} alignItems="center" sx={{ pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <CustomerAvatar name={viewing.customerName} size={56} />
              <Box>
                <Typography variant="h6" fontWeight={700}>{viewing.customerName}</Typography>
                {viewing.gstNumber && <Chip label={viewing.gstNumber} size="small" variant="outlined" color="primary" sx={{ mt: 0.5, fontFamily: 'monospace', fontSize: '0.72rem' }} />}
              </Box>
            </Stack>

            {/* Contact */}
            <Stack spacing={1.5}>
              {viewing.mobileNumber && (
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' }}>
                    <PhoneIcon fontSize="small" />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Mobile</Typography>
                    <Typography variant="body2" fontWeight={600}>{viewing.mobileNumber}</Typography>
                  </Box>
                </Stack>
              )}
              {viewing.email && (
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: alpha(theme.palette.info.main, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'info.main' }}>
                    <EmailIcon fontSize="small" />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Email</Typography>
                    <Typography variant="body2" fontWeight={600}>{viewing.email}</Typography>
                  </Box>
                </Stack>
              )}
              {(viewing.address || viewing.city) && (
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: alpha(theme.palette.success.main, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'success.main', flexShrink: 0 }}>
                    <LocationOnIcon fontSize="small" />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Address</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {[viewing.address, viewing.city, viewing.state, viewing.pincode].filter(Boolean).join(', ')}
                    </Typography>
                  </Box>
                </Stack>
              )}
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
              <Button startIcon={<EditIcon />} variant="contained" sx={{ borderRadius: 2 }}
                onClick={() => { openForm(viewing); setViewing(null); }}>
                Edit Customer
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Customer"
        message={`Are you sure you want to delete "${deleting?.customerName}"?`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
