import AddIcon from '@mui/icons-material/Add';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Alert, Box, Button, Grid, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import DocumentLines from '../../components/DocumentLines.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import useRequiredFields from '../../hooks/useRequiredFields.js';
import { currency } from '../../utils/formatters.js';
import { branchesApi, productsApi, stockAdjustmentsApi } from '../../services/resource.service.js';

/**
 * Deliberate corrections to stock — damage, expiry, loss, a found box.
 *
 * Nothing moves until the adjustment is approved. Writing inventory off is the
 * easiest way to hide a shortage, so a second name on the record is worth the
 * extra step.
 */
const REASONS = [
  'Damage', 'Expired', 'Theft/Loss', 'Found', 'Opening Stock',
  'Stock Count', 'Correction', 'Sample/Free Issue', 'Other',
];

export default function StockAdjustments() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  // A correction with no reason is indistinguishable from an error, which is
  // the one thing an adjustment must never look like.
  const adjustmentFields = useRequiredFields([
    { name: 'adjustmentDate', label: 'Adjustment date' },
    { name: 'branchId', label: 'Location' },
    { name: 'reason', label: 'Reason' },
  ]);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [list, prods, locs] = await Promise.all([
        stockAdjustmentsApi.list({ limit: 100 }),
        productsApi.list({ limit: 500 }),
        branchesApi.list({ limit: 200 }),
      ]);
      setRows(list?.data || []);
      setProducts(prods?.data || []);
      setLocations(locs?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load adjustments', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openBlank = () => setCreating({
    branchId: '', adjustmentDate: new Date().toISOString().slice(0, 10),
    reason: 'Correction', remarks: '',
    items: [{ productId: '', quantity: '', unitCost: '' }],
  });

  const submit = async () => {
    if (!adjustmentFields.check(creating, showToast)) return;

    if (!creating.items || !creating.items.some(i => i.productId && Number(i.quantity) !== 0)) {
      showToast('Add at least one product with a non-zero quantity', 'error'); return;
    }
    setBusy(true);
    try {
      await stockAdjustmentsApi.create({
        ...creating,
        branchId: Number(creating.branchId),
        items: creating.items
          .filter((i) => i.productId && Number(i.quantity) !== 0)
          .map((i) => ({
            productId: Number(i.productId),
            quantity: Number(i.quantity),
            unitCost: Number(i.unitCost || 0),
            remarks: i.remarks,
          })),
      });
      showToast('Adjustment raised — it will move stock once approved');
      setCreating(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not raise the adjustment', 'error');
    }
    setBusy(false);
  };

  const act = async (row, action) => {
    setBusy(true);
    try {
      const reason = action === 'reject' ? window.prompt('Why is this rejected?') || '' : undefined;
      await stockAdjustmentsApi[action](row.id, reason);
      showToast(action === 'approve' ? 'Approved — stock updated' : 'Adjustment rejected');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || `Could not ${action} the adjustment`, 'error');
    }
    setBusy(false);
  };

  const pending = rows.filter((r) => ['Draft', 'Pending'].includes(r.status));
  const writtenOff = rows
    .filter((r) => r.status === 'Approved' && Number(r.totalValue) < 0)
    .reduce((s, r) => s + Math.abs(Number(r.totalValue || 0)), 0);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Stock Adjustments"
        subtitle="Corrections outside the normal buy and sell flow — each one approved before it moves stock"
        icon={<TuneIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={openBlank}>New Adjustment</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Awaiting approval" value={pending.length} detail="No stock moved yet" icon={<TuneIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Applied" value={rows.filter((r) => r.status === 'Approved').length} detail="Stock corrected" icon={<TuneIcon />} gradient="success" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Written off" value={currency(writtenOff)} detail="Value of approved losses" icon={<TuneIcon />} gradient="danger" />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="adjustmentNumber"
          rows={rows}
          columns={[
            { field: 'adjustmentNumber', headerName: 'Adjustment', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.adjustmentNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{r.adjustmentDate}</Typography>
              </Box>
            )},
            { field: 'branch', headerName: 'Location', render: (r) => r.Branch?.branchName || '—' },
            { field: 'reason', headerName: 'Reason' },
            { field: 'totalValue', headerName: 'Value', render: (r) => (
              <Typography fontWeight={700} color={Number(r.totalValue) < 0 ? 'error.main' : 'success.main'}>
                {currency(r.totalValue)}
              </Typography>
            )},
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5}>
                <Button size="small" onClick={() => stockAdjustmentsApi.get(r.id).then(setViewing)}>View</Button>
                {['Draft', 'Pending'].includes(r.status) && (
                  <>
                    <Button size="small" variant="outlined" disabled={busy} onClick={() => act(r, 'approve')}>Approve</Button>
                    <Button size="small" color="error" disabled={busy} onClick={() => act(r, 'reject')}>Reject</Button>
                  </>
                )}
              </Stack>
            )},
          ]}
        />
      )}

      <Modal open={Boolean(creating)} title="New Stock Adjustment" onClose={() => setCreating(null)} maxWidth="md">
        {creating && (
          <Stack spacing={2}>
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              Use a <strong>negative</strong> quantity to write stock off and a positive one to add it back.
              Nothing changes until this is approved.
            </Alert>

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}>
                <TextField
                  select fullWidth size="small" label="Location" {...adjustmentFields.fieldProps('branchId', creating)} value={creating.branchId}
                  onChange={(e) => setCreating({ ...creating, branchId: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                >
                  {locations.map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      {l.branchName}{l.locationType === 'Warehouse' ? ' (Warehouse)' : ''}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  select fullWidth size="small" label="Reason" {...adjustmentFields.fieldProps('reason', creating)} value={creating.reason}
                  onChange={(e) => setCreating({ ...creating, reason: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                >
                  {REASONS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth size="small" type="date" label="Date" {...adjustmentFields.fieldProps('adjustmentDate', creating)} value={creating.adjustmentDate}
                  onChange={(e) => setCreating({ ...creating, adjustmentDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>

            <DocumentLines
              lines={creating.items}
              onChange={(items) => setCreating({ ...creating, items })}
              products={products}
              emptyLine={{ quantity: '', unitCost: '' }}
              columns={[
                { key: 'quantity', label: 'Change (+/−)', width: 120, inputProps: { step: 'any' } },
                { key: 'unitCost', label: 'Unit cost', inputProps: { min: 0, step: 'any' } },
                { key: 'value', label: 'Value', render: (l) => (
                  <Typography variant="body2" fontWeight={600}
                    color={Number(l.quantity) < 0 ? 'error.main' : 'success.main'}>
                    {currency(Number(l.quantity || 0) * Number(l.unitCost || 0))}
                  </Typography>
                )},
                { key: 'remarks', label: 'Note', type: 'text', align: 'left', width: 160 },
              ]}
            />

            <TextField
              fullWidth size="small" label="Remarks" multiline minRows={2} value={creating.remarks}
              onChange={(e) => setCreating({ ...creating, remarks: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setCreating(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button
                variant="contained" sx={{ borderRadius: 2 }}
                disabled={busy || !creating.branchId
                  || !creating.items.some((i) => i.productId && Number(i.quantity) !== 0)}
                onClick={submit}
              >
                {busy ? 'Saving…' : 'Raise Adjustment'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      <Modal open={Boolean(viewing)} title={viewing?.adjustmentNumber || ''} onClose={() => setViewing(null)} maxWidth="md">
        {viewing && (
          <Stack spacing={2}>
            <Grid container spacing={1}>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Location</Typography><Typography variant="body2" fontWeight={600}>{viewing.Branch?.branchName}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Reason</Typography><Typography variant="body2" fontWeight={600}>{viewing.reason}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Value</Typography><Typography variant="body2" fontWeight={600}>{currency(viewing.totalValue)}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Status</Typography><Box><StatusChip status={viewing.status} /></Box></Grid>
            </Grid>
            <DocumentLines
              lines={viewing.StockAdjustmentItems || []}
              onChange={() => {}} products={products} readOnly
              columns={[
                { key: 'systemQuantity', label: 'System had' },
                { key: 'quantity', label: 'Change' },
                { key: 'unitCost', label: 'Unit cost' },
                { key: 'remarks', label: 'Note', align: 'left' },
              ]}
            />
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
