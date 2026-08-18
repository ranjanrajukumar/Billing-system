import { useState, useEffect } from 'react';
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Box,
  IconButton
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';
import DataTable from '../components/DataTable.jsx';
import SupplierSelect from '../components/SupplierSelect.jsx';

const STATUS_COLORS = {
  Scheduled: 'primary',
  Arrived: 'info',
  Docked: 'warning',
  Completed: 'success',
  Cancelled: 'error',
};

export default function InboundAppointments() {
  const { showToast } = useToast();
  
  const [appointments, setAppointments] = useState({ data: [], totalPages: 1 });
  const [isLoading, setIsLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 10 });
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      const { data } = await api.get(`/inbound-appointments?${params}`);
      setAppointments(data);
    } catch (err) {
      showToast('Failed to load appointments', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, search, statusFilter]);

  const handleSave = async () => {
    try {
      if (editingItem?.id) {
        await api.put(`/inbound-appointments/${editingItem.id}`, editingItem);
      } else {
        await api.post('/inbound-appointments', editingItem);
      }
      showToast('Appointment saved successfully', 'success');
      setDialogOpen(false);
      loadData();
    } catch (err) {
      showToast('Failed to save appointment', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/inbound-appointments/${id}`);
      showToast('Appointment cancelled', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to cancel appointment', 'error');
    }
  };

  const handleOpen = (item = null) => {
    setEditingItem(item || {
      expectedArrival: new Date().toISOString().slice(0, 16),
      status: 'Scheduled',
      supplierId: '',
      poId: '',
      dockNumber: '',
      vehicleNumber: '',
      driverName: '',
      driverContact: '',
      notes: ''
    });
    setDialogOpen(true);
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={2} alignItems="center">
          <AssignmentIcon color="primary" fontSize="large" />
          <Typography variant="h5" fontWeight="700">Inbound Appointments (ASN)</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
          New Appointment
        </Button>
      </Stack>

      <Stack direction="row" spacing={2}>
        <TextField
          size="small"
          placeholder="Search by number, dock, or vehicle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 300 }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ width: 150 }}
        >
          <MenuItem value="">All Statuses</MenuItem>
          {Object.keys(STATUS_COLORS).map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
      </Stack>

      <DataTable
        loading={isLoading}
        columns={[
          { field: 'appointmentNumber', headerName: 'Appt No.' },
          { field: 'expectedArrival', headerName: 'Expected Arrival', render: (row) => new Date(row.expectedArrival).toLocaleString() },
          { field: 'supplierName', headerName: 'Supplier', render: (row) => row.Supplier?.supplierName || '-' },
          { field: 'poNumber', headerName: 'PO No.', render: (row) => row.PurchaseOrder?.poNumber || '-' },
          { field: 'dockNumber', headerName: 'Dock' },
          { field: 'vehicleNumber', headerName: 'Vehicle' },
          {
            field: 'status',
            headerName: 'Status',
            render: (row) => (
              <Chip
                label={row.status}
                color={STATUS_COLORS[row.status] || 'default'}
                size="small"
                variant="outlined"
              />
            ),
          },
          {
            field: 'actions',
            headerName: 'Actions',
            render: (row) => (
              <Box>
                <IconButton size="small" onClick={() => handleOpen(row)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => handleDelete(row.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ),
          }
        ]}
        rows={appointments?.data || []}
        page={page}
        totalPages={appointments?.totalPages || 1}
        onPageChange={setPage}
        onEdit={handleOpen}
        onDelete={(row) => {
          if (confirm('Cancel this appointment?')) handleDelete(row.id);
        }}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingItem?.id ? 'Edit Appointment' : 'Create Appointment'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <SupplierSelect
                value={editingItem?.supplierId || ''}
                onChange={(supplier) => setEditingItem({ ...editingItem, supplierId: supplier?.id || null })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="datetime-local"
                label="Expected Arrival"
                value={editingItem?.expectedArrival ? editingItem.expectedArrival.slice(0, 16) : ''}
                onChange={(e) => setEditingItem({ ...editingItem, expectedArrival: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Status"
                value={editingItem?.status || 'Scheduled'}
                onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
              >
                {Object.keys(STATUS_COLORS).map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Dock Number"
                placeholder="e.g. DOCK-01"
                value={editingItem?.dockNumber || ''}
                onChange={(e) => setEditingItem({ ...editingItem, dockNumber: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Vehicle Number"
                value={editingItem?.vehicleNumber || ''}
                onChange={(e) => setEditingItem({ ...editingItem, vehicleNumber: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Driver Name"
                value={editingItem?.driverName || ''}
                onChange={(e) => setEditingItem({ ...editingItem, driverName: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Driver Contact"
                value={editingItem?.driverContact || ''}
                onChange={(e) => setEditingItem({ ...editingItem, driverContact: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Notes"
                value={editingItem?.notes || ''}
                onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
