import AddIcon from '@mui/icons-material/Add';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import {
  Alert, Box, Button, Grid, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography, Paper,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { branchesApi, stockCountsApi } from '../services/resource.service.js';

/**
 * Physical stock counting.
 *
 * Opening a sheet freezes the system quantity onto every line, and the variance
 * is measured against that frozen figure — comparing a 9am count to a 5pm book
 * balance would mostly measure the day's trading.
 */
export default function StockCounts() {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ branchId: '', countDate: new Date().toISOString().slice(0, 10), remarks: '' });
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [list, locs] = await Promise.all([
        stockCountsApi.list({ limit: 100 }),
        branchesApi.list({ limit: 200 }),
      ]);
      setRows(list?.data || []);
      setLocations(locs?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load stock counts', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const start = async () => {
    setBusy(true);
    try {
      const created = await stockCountsApi.create({ ...form, branchId: Number(form.branchId) });
      showToast(`Count sheet opened with ${created.StockCountItems?.length || 0} lines`);
      setCreating(false);
      setSheet(created);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open a count sheet', 'error');
    }
    setBusy(false);
  };

  const setPhysical = (itemId, value) => {
    setSheet({
      ...sheet,
      StockCountItems: sheet.StockCountItems.map((i) => (
        i.id === itemId ? { ...i, physicalQuantity: value } : i
      )),
    });
  };

  const save = async (submit) => {
    setBusy(true);
    try {
      const updated = await stockCountsApi.saveCounts(sheet.id, {
        submit,
        items: sheet.StockCountItems
          .filter((i) => i.physicalQuantity !== null && i.physicalQuantity !== '')
          .map((i) => ({ id: i.id, physicalQuantity: Number(i.physicalQuantity), remarks: i.remarks })),
      });
      setSheet(updated);
      showToast(submit ? 'Count submitted for approval' : 'Counts saved');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the counts', 'error');
    }
    setBusy(false);
  };

  const approve = async (row) => {
    setBusy(true);
    try {
      await stockCountsApi.approve(row.id);
      showToast('Count approved — variance posted to stock');
      setSheet(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not approve the count', 'error');
    }
    setBusy(false);
  };

  const varianceOf = (row) => (row.StockCountItems || [])
    .reduce((s, i) => s + Math.abs(Number(i.variance || 0)), 0);

  const open = rows.filter((r) => ['Draft', 'Counting', 'Pending'].includes(r.status));

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Stock Counting"
        subtitle="Count what is physically there and post the difference"
        icon={<FactCheckIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreating(true)}>Start Count</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Open counts" value={open.length} detail="In progress or awaiting sign-off" icon={<FactCheckIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Completed" value={rows.filter((r) => r.status === 'Approved').length} detail="Variance posted" icon={<FactCheckIcon />} gradient="success" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Total counts" value={rows.length} detail="All time" icon={<FactCheckIcon />} gradient="primary" />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="countNumber"
          rows={rows}
          columns={[
            { field: 'countNumber', headerName: 'Count', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.countNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{r.countDate}</Typography>
              </Box>
            )},
            { field: 'branch', headerName: 'Location', render: (r) => r.Branch?.branchName || '—' },
            { field: 'lines', headerName: 'Lines', render: (r) => (r.StockCountItems || []).length },
            { field: 'variance', headerName: 'Variance', render: (r) => {
              const v = varianceOf(r);
              return (
                <Typography fontWeight={700} color={v ? 'warning.main' : 'text.secondary'}>
                  {v ? `${v} units` : '—'}
                </Typography>
              );
            }},
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5}>
                <Button size="small" onClick={() => stockCountsApi.get(r.id).then(setSheet)}>
                  {['Draft', 'Counting'].includes(r.status) ? 'Count' : 'View'}
                </Button>
                {r.status === 'Pending' && (
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => approve(r)}>Approve</Button>
                )}
              </Stack>
            )},
          ]}
        />
      )}

      <Modal open={creating} title="Start a Stock Count" onClose={() => setCreating(false)} maxWidth="sm">
        <Stack spacing={2}>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            The sheet is created with every product this location holds, and each line records the system
            quantity as it stands right now.
          </Alert>
          <TextField
            select fullWidth size="small" label="Location" value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            InputLabelProps={{ shrink: true }}
          >
            {locations.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.branchName}{l.locationType === 'Warehouse' ? ' (Warehouse)' : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth size="small" type="date" label="Count date" value={form.countDate}
            onChange={(e) => setForm({ ...form, countDate: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth size="small" label="Remarks" value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setCreating(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button variant="contained" disabled={busy || !form.branchId} onClick={start} sx={{ borderRadius: 2 }}>
              {busy ? 'Opening…' : 'Open Sheet'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      {/* Count sheet */}
      <Modal open={Boolean(sheet)} title={sheet?.countNumber || ''} onClose={() => setSheet(null)} maxWidth="lg">
        {sheet && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              <StatusChip status={sheet.status} />
              <Typography variant="body2" color="text.secondary">
                {(sheet.StockCountItems || []).length} lines
              </Typography>
            </Stack>

            <Paper variant="outlined" sx={{ borderRadius: 2, maxHeight: 420, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>System</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Counted</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Variance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(sheet.StockCountItems || []).map((item) => {
                    const counted = item.physicalQuantity;
                    const variance = counted === null || counted === ''
                      ? null
                      : Number(counted) - Number(item.systemQuantity);
                    const editable = ['Draft', 'Counting', 'Pending'].includes(sheet.status);

                    return (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography variant="body2">{item.Product?.productName || `#${item.productId}`}</Typography>
                          {item.Product?.sku && (
                            <Typography variant="caption" color="text.secondary">{item.Product.sku}</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{Number(item.systemQuantity)}</TableCell>
                        <TableCell align="right">
                          {editable ? (
                            <TextField
                              size="small" type="number" sx={{ width: 110 }}
                              value={counted ?? ''}
                              onChange={(e) => setPhysical(item.id, e.target.value)}
                              inputProps={{ style: { textAlign: 'right' }, step: 'any' }}
                            />
                          ) : (counted ?? '—')}
                        </TableCell>
                        <TableCell align="right">
                          {variance === null ? (
                            <Typography variant="caption" color="text.disabled">not counted</Typography>
                          ) : (
                            <Typography
                              variant="body2" fontWeight={700}
                              color={variance === 0 ? 'success.main' : variance < 0 ? 'error.main' : 'warning.main'}
                            >
                              {variance > 0 ? `+${variance}` : variance}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Paper>

            {['Draft', 'Counting', 'Pending'].includes(sheet.status) && (
              <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap">
                <Button onClick={() => setSheet(null)} variant="outlined" sx={{ borderRadius: 2 }}>Close</Button>
                <Button onClick={() => save(false)} disabled={busy} variant="outlined" sx={{ borderRadius: 2 }}>
                  Save Progress
                </Button>
                <Button onClick={() => save(true)} disabled={busy} variant="contained" sx={{ borderRadius: 2 }}>
                  Submit for Approval
                </Button>
                {sheet.status === 'Pending' && (
                  <Button onClick={() => approve(sheet)} disabled={busy} variant="contained" color="success" sx={{ borderRadius: 2 }}>
                    Approve & Post
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
