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
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';
import DataTable from '../components/DataTable.jsx';

const STATUS_COLORS = {
  Pending: 'warning',
  Partial: 'info',
  Passed: 'success',
  Failed: 'error',
};

export default function QcInspections() {
  const { showToast } = useToast();
  
  const [inspections, setInspections] = useState({ data: [], totalPages: 1 });
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
      const { data } = await api.get(`/qc?${params}`);
      setInspections(data);
    } catch (err) {
      showToast('Failed to load inspections', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, search, statusFilter]);

  const handleSave = async () => {
    if (Number(editingItem.passedQty) + Number(editingItem.failedQty) > Number(editingItem.inspectedQty)) {
      showToast('Passed and Failed quantities cannot exceed the total inspected quantity', 'error');
      return;
    }
    if (Number(editingItem.passedQty) < 0 || Number(editingItem.failedQty) < 0) {
      showToast('Quantities cannot be negative', 'error'); return;
    }
    try {
      if (editingItem?.id) {
        await api.put(`/qc/${editingItem.id}`, editingItem);
        showToast('QC results saved successfully', 'success');
        setDialogOpen(false);
        loadData();
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save QC results', 'error');
    }
  };

  const handleOpen = (item) => {
    setEditingItem({
      ...item,
      passedQty: item.passedQty || 0,
      failedQty: item.failedQty || 0,
    });
    setDialogOpen(true);
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={2} alignItems="center">
          <FactCheckIcon color="primary" fontSize="large" />
          <Typography variant="h5" fontWeight="700">QC Inspections</Typography>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2}>
        <TextField
          size="small"
          placeholder="Search by QC number..."
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
          { key: 'inspectionNumber', label: 'QC Number' },
          { key: 'Grn.grnNumber', label: 'Source (GRN)', render: (r) => r.Grn?.grnNumber || '-' },
          { key: 'SalesReturn.returnNumber', label: 'Source (Return)', render: (r) => r.SalesReturn?.returnNumber || '-' },
          { key: 'Product.productName', label: 'Product' },
          { key: 'inspectedQty', label: 'Total Qty' },
          { key: 'passedQty', label: 'Passed Qty' },
          { key: 'failedQty', label: 'Failed Qty' },
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
        data={inspections?.data || []}
        page={page}
        totalPages={inspections?.totalPages || 1}
        onPageChange={setPage}
        onEdit={handleOpen}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log QC Results - {editingItem?.inspectionNumber}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" fontWeight="bold">
                {editingItem?.Product?.productName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Quantity to Inspect: {editingItem?.inspectedQty}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Passed Quantity"
                value={editingItem?.passedQty}
                onChange={(e) => setEditingItem({ ...editingItem, passedQty: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Failed Quantity"
                value={editingItem?.failedQty}
                onChange={(e) => setEditingItem({ ...editingItem, failedQty: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Inspection Notes"
                value={editingItem?.notes || ''}
                onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={editingItem?.status === 'Passed' || editingItem?.status === 'Failed'}>
            Finalize Results
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
