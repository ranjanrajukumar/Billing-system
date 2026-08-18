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
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';
import DataTable from '../components/DataTable.jsx';

const STATUS_COLORS = {
  Pending: 'warning',
  InTransit: 'info',
  Delivered: 'success',
  Cancelled: 'error',
};

export default function Shipments() {
  const { showToast } = useToast();
  
  const [shipments, setShipments] = useState({ data: [], totalPages: 1 });
  const [isLoading, setIsLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [invoices, setInvoices] = useState([]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 10 });
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      const { data } = await api.get(`/shipments?${params}`);
      setShipments(data);
    } catch (err) {
      showToast('Failed to load shipments', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadInvoices = async () => {
    try {
      const { data } = await api.get('/invoices?status=Paid,Unpaid&limit=50');
      setInvoices(data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, search, statusFilter]);

  const handleSave = async () => {
    try {
      if (editingItem?.id) {
        await api.put(`/shipments/${editingItem.id}`, editingItem);
      } else {
        await api.post('/shipments', editingItem);
      }
      showToast('Shipment saved successfully', 'success');
      setDialogOpen(false);
      loadData();
    } catch (err) {
      showToast('Failed to save shipment', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/shipments/${id}`);
      showToast('Shipment cancelled', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to cancel shipment', 'error');
    }
  };

  const handleOpen = (item = null) => {
    if (!item) loadInvoices();
    setEditingItem(item || {
      status: 'Pending',
      shippingDate: new Date().toISOString().slice(0, 10),
      carrierName: '',
      trackingNumber: '',
      notes: '',
      invoiceId: ''
    });
    setDialogOpen(true);
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={2} alignItems="center">
          <LocalShippingIcon color="primary" fontSize="large" />
          <Typography variant="h5" fontWeight="700">Shipments</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
          New Shipment
        </Button>
      </Stack>

      <Stack direction="row" spacing={2}>
        <TextField
          size="small"
          placeholder="Search by tracking or carrier..."
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
          { key: 'shipmentNumber', label: 'Shipment No.' },
          { key: 'Invoice.invoiceNumber', label: 'Invoice No.', render: (row) => row.Invoice?.invoiceNumber || '-' },
          { key: 'carrierName', label: 'Carrier' },
          { key: 'trackingNumber', label: 'Tracking No.' },
          { key: 'shippingDate', label: 'Ship Date', render: (row) => row.shippingDate ? new Date(row.shippingDate).toLocaleDateString() : '-' },
          {
            key: 'status',
            label: 'Status',
            render: (row) => (
              <Chip
                label={row.status}
                color={STATUS_COLORS[row.status] || 'default'}
                size="small"
                variant="outlined"
              />
            ),
          },
        ]}
        data={shipments?.data || []}
        page={page}
        totalPages={shipments?.totalPages || 1}
        onPageChange={setPage}
        onEdit={handleOpen}
        onDelete={(row) => {
          if (confirm('Cancel this shipment?')) handleDelete(row.id);
        }}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingItem?.id ? 'Edit Shipment' : 'Create Shipment'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Link to Invoice"
                value={editingItem?.invoiceId || ''}
                onChange={(e) => setEditingItem({ ...editingItem, invoiceId: e.target.value })}
                disabled={!!editingItem?.id}
              >
                {invoices.map((inv) => (
                  <MenuItem key={inv.id} value={inv.id}>{inv.invoiceNumber}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Status"
                value={editingItem?.status || 'Pending'}
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
                label="Carrier Name"
                value={editingItem?.carrierName || ''}
                onChange={(e) => setEditingItem({ ...editingItem, carrierName: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Tracking Number"
                value={editingItem?.trackingNumber || ''}
                onChange={(e) => setEditingItem({ ...editingItem, trackingNumber: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="date"
                label="Shipping Date"
                value={editingItem?.shippingDate ? editingItem.shippingDate.slice(0, 10) : ''}
                onChange={(e) => setEditingItem({ ...editingItem, shippingDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
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
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
