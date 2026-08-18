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
import BuildIcon from '@mui/icons-material/Build';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';
import DataTable from '../components/DataTable.jsx';

const STATUS_COLORS = {
  Pending: 'warning',
  'In Repair': 'info',
  Repaired: 'success',
  Scrapped: 'error',
};

export default function Repairs() {
  const { showToast } = useToast();
  
  const [repairs, setRepairs] = useState({ data: [], totalPages: 1 });
  const [isLoading, setIsLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 10 });
      if (statusFilter) params.append('status', statusFilter);
      const { data } = await api.get(`/repairs?${params}`);
      setRepairs(data);
    } catch (err) {
      showToast('Failed to load repair orders', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, statusFilter]);

  const handleSave = async () => {
    try {
      if (editingItem?.id) {
        await api.put(`/repairs/${editingItem.id}`, editingItem);
        showToast('Repair order updated', 'success');
        setDialogOpen(false);
        loadData();
      }
    } catch (err) {
      showToast('Failed to save repair order', 'error');
    }
  };

  const handleOpen = (item) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={2} alignItems="center">
          <BuildIcon color="primary" fontSize="large" />
          <Typography variant="h5" fontWeight="700">Damage & Repairs</Typography>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2}>
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ width: 200 }}
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
          { key: 'repairNumber', label: 'Repair No.' },
          { key: 'Product.productName', label: 'Product' },
          { key: 'QcInspection.inspectionNumber', label: 'Source QC', render: (r) => r.QcInspection?.inspectionNumber || 'Manual' },
          { key: 'quantity', label: 'Qty' },
          { key: 'repairCost', label: 'Cost', render: (r) => `$${r.repairCost || 0}` },
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
        data={repairs?.data || []}
        page={page}
        totalPages={repairs?.totalPages || 1}
        onPageChange={setPage}
        onEdit={handleOpen}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Update Repair Order</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" fontWeight="bold">
                {editingItem?.Product?.productName} (Qty: {editingItem?.quantity})
              </Typography>
              <Typography variant="body2" color="error">
                Issue: {editingItem?.issueDescription}
              </Typography>
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
                type="number"
                label="Repair Cost"
                value={editingItem?.repairCost || ''}
                onChange={(e) => setEditingItem({ ...editingItem, repairCost: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={editingItem?.status === 'Repaired' || editingItem?.status === 'Scrapped'}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
