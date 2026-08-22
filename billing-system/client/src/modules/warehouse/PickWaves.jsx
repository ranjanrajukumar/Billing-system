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
import AssignmentIcon from '@mui/icons-material/Assignment';
import { useToast } from '../../context/ToastContext.jsx';
import api from '../../services/api.js';
import DataTable from '../../components/DataTable.jsx';

const STATUS_COLORS = {
  Planned: 'warning',
  Released: 'info',
  Picking: 'primary',
  Picked: 'success',
  Completed: 'success',
  Cancelled: 'error',
};

export default function PickWaves() {
  const { showToast } = useToast();
  
  const [waves, setWaves] = useState({ data: [], totalPages: 1 });
  const [isLoading, setIsLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [pendingOrders, setPendingOrders] = useState([]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 10 });
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      const { data } = await api.get(`/waves?${params}`);
      setWaves(data);
    } catch (err) {
      showToast('Failed to load waves', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const loadPendingOrders = async () => {
    try {
      const { data } = await api.get('/sales-orders?status=Approved&limit=50');
      // Filter out orders already in a wave
      const available = data.data.filter(o => !o.waveId);
      setPendingOrders(available);
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
        await api.put(`/waves/${editingItem.id}`, editingItem);
      } else {
        await api.post('/waves', editingItem);
      }
      showToast('Wave saved successfully', 'success');
      setDialogOpen(false);
      loadData();
    } catch (err) {
      showToast('Failed to save wave', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/waves/${id}`);
      showToast('Wave cancelled', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to cancel wave', 'error');
    }
  };

  const handleOpen = (item = null) => {
    if (!item) loadPendingOrders();
    setEditingItem(item || {
      status: 'Planned',
      notes: '',
      orderIds: []
    });
    setDialogOpen(true);
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={2} alignItems="center">
          <AssignmentIcon color="primary" fontSize="large" />
          <Typography variant="h5" fontWeight="700">Pick Waves</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
          Plan New Wave
        </Button>
      </Stack>

      <Stack direction="row" spacing={2}>
        <TextField
          size="small"
          placeholder="Search by wave number..."
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
          { key: 'waveNumber', label: 'Wave Number' },
          { key: 'Branch.branchName', label: 'Branch' },
          { key: 'SalesOrders.length', label: 'Orders Included', render: (row) => row.SalesOrders?.length || 0 },
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
        data={waves?.data || []}
        page={page}
        totalPages={waves?.totalPages || 1}
        onPageChange={setPage}
        onEdit={handleOpen}
        onDelete={(row) => {
          if (confirm('Cancel this wave?')) handleDelete(row.id);
        }}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingItem?.id ? 'Edit Wave' : 'Plan Pick Wave'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                select
                fullWidth
                label="Status"
                value={editingItem?.status || 'Planned'}
                onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
              >
                {Object.keys(STATUS_COLORS).map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </TextField>
            </Grid>
            {!editingItem?.id && (
              <Grid item xs={12}>
                <TextField
                  select
                  SelectProps={{ multiple: true }}
                  fullWidth
                  label="Select Orders for Wave"
                  value={editingItem?.orderIds || []}
                  onChange={(e) => setEditingItem({ ...editingItem, orderIds: e.target.value })}
                >
                  {pendingOrders.map((o) => (
                    <MenuItem key={o.id} value={o.id}>{o.orderNumber}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Notes / Instructions"
                value={editingItem?.notes || ''}
                onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save Wave</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
