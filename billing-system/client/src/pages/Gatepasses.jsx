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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';
import DataTable from '../components/DataTable.jsx';

const GATEPASS_STATUS_COLORS = {
  Pending: 'warning',
  'Checked-In': 'info',
  'Checked-Out': 'success',
  Cancelled: 'error',
};

export default function Gatepasses() {
  const { showToast } = useToast();
  
  const [gatepasses, setGatepasses] = useState({ data: [], totalPages: 1 });
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
      const { data } = await api.get(`/gatepasses?${params}`);
      setGatepasses(data);
    } catch (err) {
      showToast('Failed to load gatepasses', 'error');
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
        await api.put(`/gatepasses/${editingItem.id}`, editingItem);
      } else {
        await api.post('/gatepasses', editingItem);
      }
      showToast('Gatepass saved successfully', 'success');
      setDialogOpen(false);
      loadData();
    } catch (err) {
      showToast('Failed to save gatepass', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/gatepasses/${id}`);
      showToast('Gatepass deleted', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to delete gatepass', 'error');
    }
  };

  const handleOpen = (item = null) => {
    setEditingItem(item || {
      gatepassType: 'Inward',
      gatepassDate: new Date().toISOString().slice(0, 10),
      status: 'Pending',
      referenceType: 'Manual',
      referenceNumber: '',
      vehicleNumber: '',
      driverName: '',
      driverContact: '',
      transporterName: '',
      notes: ''
    });
    setDialogOpen(true);
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={2} alignItems="center">
          <DescriptionIcon color="primary" fontSize="large" />
          <Typography variant="h5" fontWeight="700">Gatepasses</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
          New Gatepass
        </Button>
      </Stack>

      <Stack direction="row" spacing={2}>
        <TextField
          size="small"
          placeholder="Search by number, reference, or driver..."
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
          {Object.keys(GATEPASS_STATUS_COLORS).map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
      </Stack>

      <DataTable
        loading={isLoading}
        columns={[
          { key: 'gatepassNumber', label: 'Gatepass No.' },
          { key: 'gatepassType', label: 'Type' },
          { key: 'gatepassDate', label: 'Date' },
          { key: 'referenceNumber', label: 'Ref No.' },
          { key: 'vehicleNumber', label: 'Vehicle' },
          { key: 'driverName', label: 'Driver' },
          {
            key: 'status',
            label: 'Status',
            render: (row) => (
              <Chip
                label={row.status}
                color={GATEPASS_STATUS_COLORS[row.status] || 'default'}
                size="small"
                variant="outlined"
              />
            ),
          },
        ]}
        data={gatepasses?.data || []}
        page={page}
        totalPages={gatepasses?.totalPages || 1}
        onPageChange={setPage}
        onEdit={handleOpen}
        onDelete={(row) => {
          if (confirm('Delete this gatepass?')) handleDelete(row.id);
        }}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingItem?.id ? 'Edit Gatepass' : 'Create Gatepass'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={4}>
              <TextField
                select
                fullWidth
                label="Gatepass Type"
                value={editingItem?.gatepassType || 'Inward'}
                onChange={(e) => setEditingItem({ ...editingItem, gatepassType: e.target.value })}
              >
                <MenuItem value="Inward">Inward</MenuItem>
                <MenuItem value="Outward">Outward</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="date"
                label="Date"
                value={editingItem?.gatepassDate || ''}
                onChange={(e) => setEditingItem({ ...editingItem, gatepassDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                select
                fullWidth
                label="Status"
                value={editingItem?.status || 'Pending'}
                onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
              >
                {Object.keys(GATEPASS_STATUS_COLORS).map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Reference Type"
                value={editingItem?.referenceType || 'Manual'}
                onChange={(e) => setEditingItem({ ...editingItem, referenceType: e.target.value })}
              >
                <MenuItem value="Manual">Manual</MenuItem>
                <MenuItem value="Invoice">Invoice</MenuItem>
                <MenuItem value="PurchaseOrder">Purchase Order</MenuItem>
                <MenuItem value="DeliveryChallan">Delivery Challan</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Reference No."
                placeholder="INV-2026-001"
                value={editingItem?.referenceNumber || ''}
                onChange={(e) => setEditingItem({ ...editingItem, referenceNumber: e.target.value })}
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
                label="Transporter Name"
                value={editingItem?.transporterName || ''}
                onChange={(e) => setEditingItem({ ...editingItem, transporterName: e.target.value })}
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

            <Grid item xs={12}>
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
          <Button variant="contained" onClick={handleSave}>
            Save Gatepass
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
