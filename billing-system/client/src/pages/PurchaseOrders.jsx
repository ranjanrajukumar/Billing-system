import AddIcon from '@mui/icons-material/Add';
import AssignmentIcon from '@mui/icons-material/Assignment';
import {
  Alert, Box, Button, Grid, LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import DocumentLines from '../components/DocumentLines.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { currency } from '../utils/formatters.js';
import { branchesApi, productsApi, purchaseOrdersApi, suppliersApi } from '../services/resource.service.js';

/**
 * Purchase orders.
 *
 * A PO is a commitment, so nothing here moves stock — goods arrive through a
 * GRN. The progress bar on each row is the point of the screen: it shows how
 * much of what was ordered has actually turned up.
 */

const ACTIONS_BY_STATUS = {
  Draft: ['submit', 'cancel'],
  'Pending Approval': ['approve', 'reject'],
  Rejected: ['submit'],
  Approved: ['close', 'cancel'],
  'Partially Received': ['close'],
};

const LABEL = { submit: 'Submit', approve: 'Approve', reject: 'Reject', cancel: 'Cancel', close: 'Close' };

export default function PurchaseOrders() {
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const blank = () => ({
    supplierId: '', branchId: '', poDate: new Date().toISOString().slice(0, 10),
    expectedDate: '', terms: '', notes: '',
    items: [{ productId: '', quantity: '', rate: '', gstPercent: '' }],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [list, sups, prods, locs] = await Promise.all([
        purchaseOrdersApi.list({ limit: 100 }),
        suppliersApi.list({ limit: 300 }),
        productsApi.list({ limit: 500 }),
        branchesApi.list({ limit: 200 }),
      ]);
      setRows(list?.data || []);
      setSuppliers(sups?.data || []);
      setProducts(prods?.data || []);
      setLocations(locs?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load purchase orders', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const lineTotal = (line) => {
    const taxable = Math.max(Number(line.quantity || 0) * Number(line.rate || 0) - Number(line.discount || 0), 0);
    return taxable + taxable * Number(line.gstPercent || 0) / 100;
  };
  const orderTotal = (items) => items.reduce((sum, line) => sum + lineTotal(line), 0);

  const submitForm = async () => {
    setBusy(true);
    try {
      const payload = {
        ...editing,
        supplierId: Number(editing.supplierId),
        branchId: editing.branchId ? Number(editing.branchId) : undefined,
        items: editing.items
          .filter((i) => i.productId && Number(i.quantity) > 0)
          .map((i) => ({
            productId: Number(i.productId),
            quantity: Number(i.quantity),
            rate: Number(i.rate || 0),
            discount: Number(i.discount || 0),
            gstPercent: Number(i.gstPercent || 0),
            um: i.um,
          })),
      };
      if (editing.id) await purchaseOrdersApi.update(editing.id, payload);
      else await purchaseOrdersApi.create(payload);
      showToast('Purchase order saved');
      setEditing(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the order', 'error');
    }
    setBusy(false);
  };

  const act = async (row, action) => {
    setBusy(true);
    try {
      const reason = ['reject', 'close'].includes(action)
        ? window.prompt(action === 'reject' ? 'Why is this order rejected?' : 'Why is this order being closed short?') || ''
        : undefined;
      const result = await purchaseOrdersApi[action](row.id, reason);
      // Submitting an order that trips no rule is approved outright, which is
      // worth saying out loud rather than leaving the user to notice.
      showToast(action === 'submit' && result?.status === 'Approved'
        ? 'Order approved — it was below every approval threshold'
        : `Order ${action === 'submit' ? 'submitted' : `${action}d`}`);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || `Could not ${action} the order`, 'error');
    }
    setBusy(false);
  };

  const progress = (row) => {
    const items = row.PurchaseOrderItems || [];
    const ordered = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const received = items.reduce((s, i) => s + Number(i.receivedQty || 0), 0);
    return { ordered, received, percent: ordered ? Math.min(100, (received / ordered) * 100) : 0 };
  };

  const pending = rows.filter((r) => ['Approved', 'Partially Received'].includes(r.status));
  const awaiting = rows.filter((r) => r.status === 'Pending Approval');

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Purchase Orders"
        subtitle="What has been ordered from suppliers, and how much of it has arrived"
        icon={<AssignmentIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={() => setEditing(blank())}>New Order</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Open orders" value={pending.length} detail="Goods still expected" icon={<AssignmentIcon />} gradient="info" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Awaiting approval" value={awaiting.length} detail="Blocked until signed off" icon={<AssignmentIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard
            title="Committed value"
            value={currency(pending.reduce((s, r) => s + Number(r.grandTotal || 0), 0))}
            detail="On open orders" icon={<AssignmentIcon />} gradient="primary"
          />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="poNumber"
          rows={rows}
          columns={[
            { field: 'poNumber', headerName: 'Order', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.poNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{r.poDate}</Typography>
              </Box>
            )},
            { field: 'supplier', headerName: 'Supplier', render: (r) => r.Supplier?.supplierName || '—' },
            { field: 'grandTotal', headerName: 'Value', render: (r) => (
              <Typography fontWeight={700}>{currency(r.grandTotal)}</Typography>
            )},
            { field: 'progress', headerName: 'Received', render: (r) => {
              const p = progress(r);
              return (
                <Box sx={{ minWidth: 120 }}>
                  <Typography variant="caption" color="text.secondary">
                    {p.received} of {p.ordered}
                  </Typography>
                  <LinearProgress
                    variant="determinate" value={p.percent}
                    sx={{ height: 6, borderRadius: 3, mt: 0.5 }}
                    color={p.percent >= 100 ? 'success' : 'primary'}
                  />
                </Box>
              );
            }},
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                <Button size="small" onClick={() => purchaseOrdersApi.get(r.id).then(setViewing)}>View</Button>
                {['Draft', 'Pending Approval', 'Rejected'].includes(r.status) && (
                  <Button size="small" onClick={() => purchaseOrdersApi.get(r.id).then((full) => setEditing({
                    ...full,
                    items: (full.PurchaseOrderItems || []).map((i) => ({
                      productId: i.productId, quantity: i.quantity, rate: i.rate,
                      discount: i.discount, gstPercent: i.gstPercent, um: i.um,
                    })),
                  }))}>Edit</Button>
                )}
                {(ACTIONS_BY_STATUS[r.status] || []).map((action) => (
                  <Button
                    key={action} size="small" disabled={busy}
                    color={['reject', 'cancel'].includes(action) ? 'error' : 'primary'}
                    variant={['reject', 'cancel'].includes(action) ? 'text' : 'outlined'}
                    onClick={() => act(r, action)}
                  >
                    {LABEL[action]}
                  </Button>
                ))}
              </Stack>
            )},
          ]}
        />
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? `Edit ${editing.poNumber}` : 'New Purchase Order'}
        onClose={() => setEditing(null)}
        maxWidth="md"
      >
        {editing && (
          <Stack spacing={2}>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <TextField
                  select fullWidth size="small" label="Supplier" value={editing.supplierId || ''}
                  onChange={(e) => setEditing({ ...editing, supplierId: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                >
                  {suppliers.map((s) => <MenuItem key={s.id} value={s.id}>{s.supplierName}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  select fullWidth size="small" label="Deliver to" value={editing.branchId || ''}
                  onChange={(e) => setEditing({ ...editing, branchId: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                >
                  {locations.map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      {l.branchName}{l.locationType === 'Warehouse' ? ' (Warehouse)' : ''}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" type="date" label="Order date" value={editing.poDate || ''}
                  onChange={(e) => setEditing({ ...editing, poDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" type="date" label="Expected by" value={editing.expectedDate || ''}
                  onChange={(e) => setEditing({ ...editing, expectedDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>

            <DocumentLines
              lines={editing.items}
              onChange={(items) => setEditing({ ...editing, items })}
              products={products}
              emptyLine={{ quantity: '', rate: '', gstPercent: '', discount: 0 }}
              columns={[
                { key: 'quantity', label: 'Qty', inputProps: { min: 0, step: 'any' } },
                { key: 'rate', label: 'Rate', inputProps: { min: 0, step: 'any' } },
                { key: 'discount', label: 'Discount', inputProps: { min: 0, step: 'any' } },
                { key: 'gstPercent', label: 'GST %', inputProps: { min: 0, step: 'any' } },
                { key: 'amount', label: 'Amount', render: (line) => (
                  <Typography variant="body2" fontWeight={600}>{currency(lineTotal(line))}</Typography>
                )},
              ]}
              footer={
                <Typography variant="body2">
                  Order total: <strong>{currency(orderTotal(editing.items))}</strong>
                </Typography>
              }
            />

            <TextField
              fullWidth size="small" label="Terms & notes" multiline minRows={2} value={editing.notes || ''}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button
                variant="contained" sx={{ borderRadius: 2 }}
                disabled={busy || !editing.supplierId || !editing.items.some((i) => i.productId && Number(i.quantity) > 0)}
                onClick={submitForm}
              >
                {busy ? 'Saving…' : 'Save Order'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      <Modal open={Boolean(viewing)} title={viewing?.poNumber || ''} onClose={() => setViewing(null)} maxWidth="md">
        {viewing && (
          <Stack spacing={2}>
            <Grid container spacing={1}>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Supplier</Typography><Typography variant="body2" fontWeight={600}>{viewing.Supplier?.supplierName}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Date</Typography><Typography variant="body2" fontWeight={600}>{viewing.poDate}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Total</Typography><Typography variant="body2" fontWeight={600}>{currency(viewing.grandTotal)}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Status</Typography><Box><StatusChip status={viewing.status} /></Box></Grid>
            </Grid>

            {(viewing.Grns || []).length > 0 && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Receipts against this order: {viewing.Grns.map((g) => g.grnNumber).join(', ')}
              </Alert>
            )}

            <DocumentLines
              lines={viewing.PurchaseOrderItems || []}
              onChange={() => {}}
              products={products}
              readOnly
              columns={[
                { key: 'quantity', label: 'Ordered' },
                { key: 'receivedQty', label: 'Received' },
                { key: 'pending', label: 'Pending', render: (l) => (
                  <Typography variant="body2" fontWeight={700}>
                    {Number(l.quantity) - Number(l.receivedQty)}
                  </Typography>
                )},
                { key: 'rate', label: 'Rate' },
                { key: 'amount', label: 'Amount', render: (l) => currency(l.amount) },
              ]}
            />
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
