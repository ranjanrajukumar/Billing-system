import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Box, Button, Card, CardActions, CardContent, Chip, Divider, Grid, IconButton, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import Pagination from '../components/Pagination.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { customersApi } from '../services/resource.service.js';

const empty = { customerName: '', mobileNumber: '', email: '', gstNumber: '', address: '', city: '', state: '', pincode: '' };

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: empty });

  const load = async () => {
    setLoading(true);
    const result = await customersApi.list(query);
    setRows(result.data);
    setMeta(result.meta);
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const openForm = (row = null) => {
    setEditing(row || {});
    reset(row || empty);
  };
  const submit = async (values) => {
    editing.id ? await customersApi.update(editing.id, values) : await customersApi.create(values);
    showToast('Customer saved');
    setEditing(null);
    load();
  };
  const viewDetails = async (row) => {
    const customer = await customersApi.get(row.id);
    setViewing(customer);
  };
  const remove = async () => {
    await customersApi.remove(deleting.id);
    showToast('Customer deleted');
    setDeleting(null);
    load();
  };

  const fields = [
    { name: 'customerName', label: 'Customer Name', required: true, sm: 6 },
    { name: 'mobileNumber', label: 'Mobile Number', required: true, sm: 6 },
    { name: 'email', label: 'Email', type: 'email', sm: 6 },
    { name: 'gstNumber', label: 'GST Number', sm: 6 },
    { name: 'address', label: 'Address', required: true, sm: 12, multiline: true },
    { name: 'city', label: 'City', required: true, sm: 4 },
    { name: 'state', label: 'State', required: true, sm: 4 },
    { name: 'pincode', label: 'Pincode', required: true, sm: 4 }
  ];

  const detailRows = viewing ? [
    ['Customer Name', viewing.customerName],
    ['Mobile Number', viewing.mobileNumber],
    ['Email', viewing.email || 'Not provided'],
    ['GST Number', viewing.gstNumber || 'Not provided'],
    ['Address', viewing.address],
    ['City', viewing.city],
    ['State', viewing.state],
    ['Pincode', viewing.pincode],
    ['Created', viewing.createdAt ? new Date(viewing.createdAt).toLocaleString() : 'Not available'],
    ['Updated', viewing.updatedAt ? new Date(viewing.updatedAt).toLocaleString() : 'Not available']
  ] : [];

  const actions = (row) => (
    <Stack direction="row" spacing={0.5} justifyContent={{ xs: 'flex-end', md: 'flex-start' }}>
      <Tooltip title="View customer details">
        <IconButton aria-label="view customer details" onClick={() => viewDetails(row)}><VisibilityIcon /></IconButton>
      </Tooltip>
      <Tooltip title="Edit customer">
        <IconButton aria-label="edit customer" onClick={() => openForm(row)}><EditIcon /></IconButton>
      </Tooltip>
      <Tooltip title="Delete customer">
        <IconButton aria-label="delete customer" color="error" onClick={() => setDeleting(row)}><DeleteIcon /></IconButton>
      </Tooltip>
    </Stack>
  );

  const mobileCards = (
    <Stack spacing={1.5}>
      {rows?.map((row) => (
        <Card key={row.id} variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ pb: 1 }}>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight={700} noWrap>{row.customerName}</Typography>
                  <Typography variant="body2" color="text.secondary">{row.mobileNumber}</Typography>
                </Box>
                {row.gstNumber && <Chip size="small" label={row.gstNumber} />}
              </Stack>
              <Divider />
              <Grid container spacing={1}>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Address</Typography>
                  <Typography variant="body2">{[row.address, row.city, row.state, row.pincode].filter(Boolean).join(', ')}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Email</Typography>
                  <Typography variant="body2">{row.email || 'Not provided'}</Typography>
                </Grid>
              </Grid>
            </Stack>
          </CardContent>
          <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>{actions(row)}</CardActions>
        </Card>
      ))}
      {!rows?.length && (
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent><Typography color="text.secondary">No customers found</Typography></CardContent>
        </Card>
      )}
    </Stack>
  );

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box>
          <Typography variant="h4">Customer Management</Typography>
          <Typography variant="body2" color="text.secondary">Manage customer details for billing, GST invoices, and sales records.</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <SearchBox value={query.search} onChange={(search) => setQuery({ ...query, search, page: 1 })} />
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>Add Customer</Button>
        </Stack>
      </Stack>
      {loading ? <Loader /> : <>
        {isMobile ? mobileCards : <DataTable columns={[
          { field: 'customerName', headerName: 'Name' },
          { field: 'mobileNumber', headerName: 'Mobile' },
          { field: 'email', headerName: 'Email', render: (row) => row.email || 'Not provided' },
          { field: 'gstNumber', headerName: 'GST', render: (row) => row.gstNumber || 'Not provided' },
          { field: 'city', headerName: 'City' },
          { field: 'state', headerName: 'State' },
          { field: 'actions', headerName: 'Actions', render: actions }
        ]} rows={rows} />}
        <Pagination meta={meta} onChangePage={(page) => setQuery({ ...query, page })} onChangeLimit={(limit) => setQuery({ ...query, limit })} />
      </>}
      <Modal open={Boolean(editing)} title={editing?.id ? 'Update Customer' : 'Add Customer'} onClose={() => setEditing(null)}>
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)} sx={{ pt: 1 }}>
          {fields.map((field) => (
            <Grid item xs={12} sm={field.sm} key={field.name}>
              <TextField
                fullWidth
                label={field.label}
                type={field.type || 'text'}
                multiline={field.multiline}
                minRows={field.multiline ? 3 : undefined}
                {...register(field.name, { required: field.required && 'Required' })}
                error={Boolean(errors[field.name])}
                helperText={errors[field.name]?.message}
              />
            </Grid>
          ))}
          <Grid item xs={12}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>Save Customer</Button>
            </Stack>
          </Grid>
        </Grid>
      </Modal>
      <Modal open={Boolean(viewing)} title="Customer Details" onClose={() => setViewing(null)} maxWidth="sm">
        <Stack spacing={2} sx={{ pt: 1 }}>
          {detailRows.map(([label, value]) => (
            <Box key={label}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body1" sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
            </Box>
          ))}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button startIcon={<EditIcon />} variant="contained" onClick={() => { openForm(viewing); setViewing(null); }}>Edit Customer</Button>
          </Stack>
        </Stack>
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} message={`Delete ${deleting?.customerName}?`} onCancel={() => setDeleting(null)} onConfirm={remove} />
    </Stack>
  );
}
