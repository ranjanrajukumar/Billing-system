import AddIcon from '@mui/icons-material/Add';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CheckIcon from '@mui/icons-material/Check';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import {
  Alert, Box, Button, Grid, MenuItem, Stack, TextField, Typography,
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
import { branchesApi, productsApi, stockTransfersApi } from '../services/resource.service.js';

/**
 * Stock transfers between locations.
 *
 * The screen follows the physical reality: stock leaves the source when it is
 * dispatched and arrives at the destination when someone receives it. The
 * buttons available on a row are exactly the steps that transfer can take next,
 * so the workflow is discovered rather than memorised.
 */

const NEXT_ACTIONS = {
  Draft: ['approve', 'reject'],
  Pending: ['approve', 'reject'],
  Approved: ['dispatch', 'cancel'],
  Picked: ['dispatch', 'cancel'],
  InTransit: ['receive', 'cancel'],
  Dispatched: ['receive', 'cancel'],
  PartiallyReceived: ['receive', 'cancel'],
};

const ACTION_LABEL = {
  approve: 'Approve', reject: 'Reject', dispatch: 'Dispatch',
  receive: 'Receive', cancel: 'Cancel',
};

export default function StockTransfers() {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const [form, setForm] = useState({
    fromBranchId: '', toBranchId: '', transferDate: new Date().toISOString().slice(0, 10),
    transporter: '', vehicleNo: '', remarks: '', items: [],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [list, locs, prods] = await Promise.all([
        stockTransfersApi.list({ limit: 100 }),
        branchesApi.list({ limit: 200 }),
        productsApi.list({ limit: 500 }),
      ]);
      setRows(list?.data || []);
      setLocations(locs?.data || []);
      setProducts(prods?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load transfers', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const nameOf = (id) => locations.find((l) => l.id === id)?.branchName || `#${id}`;

  const openCreate = () => {
    setForm({
      fromBranchId: '', toBranchId: '', transferDate: new Date().toISOString().slice(0, 10),
      transporter: '', vehicleNo: '', remarks: '',
      items: [{ productId: '', quantity: '' }],
    });
    setCreating(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await stockTransfersApi.create({
        ...form,
        fromBranchId: Number(form.fromBranchId),
        toBranchId: Number(form.toBranchId),
        items: form.items
          .filter((i) => i.productId && Number(i.quantity) > 0)
          .map((i) => ({ productId: Number(i.productId), quantity: Number(i.quantity), remarks: i.remarks })),
      });
      showToast('Transfer raised');
      setCreating(false);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not raise the transfer', 'error');
    }
    setBusy(false);
  };

  const act = async (row, action) => {
    // Receiving is the one step that needs per-line figures, so it opens a form
    // rather than firing straight away — a short delivery has to be recordable.
    if (action === 'receive') {
      const full = await stockTransfersApi.get(row.id);
      setReceiving({
        ...full,
        lines: (full.StockTransferItems || []).map((i) => ({
          id: i.id,
          productId: i.productId,
          Product: i.Product,
          outstanding: Number(i.dispatchedQty) - Number(i.receivedQty) - Number(i.damagedQty),
          receivedQty: Number(i.dispatchedQty) - Number(i.receivedQty) - Number(i.damagedQty),
          damagedQty: 0,
        })),
      });
      return;
    }

    setBusy(true);
    try {
      const reason = action === 'reject' || action === 'cancel'
        ? window.prompt(`Why is this transfer being ${action === 'reject' ? 'rejected' : 'cancelled'}?`) || ''
        : undefined;
      await stockTransfersApi[action](row.id, reason);
      showToast(`Transfer ${action === 'cancel' ? 'cancelled' : `${action}d`}`);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || `Could not ${action} the transfer`, 'error');
    }
    setBusy(false);
  };

  const submitReceive = async () => {
    setBusy(true);
    try {
      await stockTransfersApi.receive(receiving.id, {
        items: receiving.lines.map((l) => ({
          id: l.id,
          receivedQty: Number(l.receivedQty || 0),
          damagedQty: Number(l.damagedQty || 0),
        })),
      });
      showToast('Goods received');
      setReceiving(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not record the receipt', 'error');
    }
    setBusy(false);
  };

  const inTransit = rows.filter((r) => ['InTransit', 'Dispatched', 'PartiallyReceived'].includes(r.status));
  const awaiting = rows.filter((r) => ['Draft', 'Pending'].includes(r.status));

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Stock Transfers"
        subtitle="Move stock between warehouses and branches, with dispatch and receipt tracked separately"
        icon={<SwapHorizIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={openCreate}>New Transfer</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Awaiting approval" value={awaiting.length} detail="Not yet released" icon={<CheckIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="In transit" value={inTransit.length} detail="Counted at neither end" icon={<LocalShippingIcon />} gradient="info" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Total transfers" value={rows.length} detail="All time" icon={<SwapHorizIcon />} gradient="primary" />
        </Grid>
      </Grid>

      {inTransit.length > 0 && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          <strong>{inTransit.length} transfer{inTransit.length > 1 ? 's are' : ' is'} in transit.</strong>{' '}
          That stock has left its source and is not yet counted at its destination — receive it to make it sellable.
        </Alert>
      )}

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="transferNumber"
          rows={rows}
          columns={[
            { field: 'transferNumber', headerName: 'Transfer', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.transferNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{r.transferDate}</Typography>
              </Box>
            )},
            { field: 'route', headerName: 'Route', render: (r) => (
              <Typography variant="body2">
                {r.fromBranch?.branchName || nameOf(r.fromBranchId)} → {r.toBranch?.branchName || nameOf(r.toBranchId)}
              </Typography>
            )},
            { field: 'totalQuantity', headerName: 'Qty', render: (r) => (
              <Typography fontWeight={700}>{Number(r.totalQuantity || 0)}</Typography>
            )},
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                <Button size="small" onClick={() => stockTransfersApi.get(r.id).then(setViewing)}>View</Button>
                {(NEXT_ACTIONS[r.status] || []).map((action) => (
                  <Button
                    key={action}
                    size="small"
                    disabled={busy}
                    color={action === 'reject' || action === 'cancel' ? 'error' : 'primary'}
                    variant={action === 'reject' || action === 'cancel' ? 'text' : 'outlined'}
                    onClick={() => act(r, action)}
                  >
                    {ACTION_LABEL[action]}
                  </Button>
                ))}
              </Stack>
            )},
          ]}
        />
      )}

      {/* New transfer */}
      <Modal open={creating} title="New Stock Transfer" onClose={() => setCreating(false)} maxWidth="md">
        <Stack spacing={2}>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                select fullWidth size="small" label="From" value={form.fromBranchId}
                onChange={(e) => setForm({ ...form, fromBranchId: e.target.value })}
                InputLabelProps={{ shrink: true }}
              >
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.branchName} {l.locationType === 'Warehouse' ? '(Warehouse)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select fullWidth size="small" label="To" value={form.toBranchId}
                onChange={(e) => setForm({ ...form, toBranchId: e.target.value })}
                InputLabelProps={{ shrink: true }}
              >
                {locations.filter((l) => String(l.id) !== String(form.fromBranchId)).map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.branchName} {l.locationType === 'Warehouse' ? '(Warehouse)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth size="small" type="date" label="Date" value={form.transferDate}
                onChange={(e) => setForm({ ...form, transferDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth size="small" label="Transporter" value={form.transporter}
                onChange={(e) => setForm({ ...form, transporter: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth size="small" label="Vehicle No" value={form.vehicleNo}
                onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>

          <DocumentLines
            lines={form.items}
            onChange={(items) => setForm({ ...form, items })}
            products={products}
            emptyLine={{ quantity: '' }}
            columns={[{ key: 'quantity', label: 'Quantity', inputProps: { min: 0, step: 'any' } }]}
            footer={
              <Typography variant="body2" color="text.secondary">
                Total: <strong>{form.items.reduce((s, i) => s + Number(i.quantity || 0), 0)}</strong> units
              </Typography>
            }
          />

          <TextField
            fullWidth size="small" label="Remarks" multiline minRows={2} value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setCreating(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button
              variant="contained" sx={{ borderRadius: 2 }}
              disabled={busy || !form.fromBranchId || !form.toBranchId
                || !form.items.some((i) => i.productId && Number(i.quantity) > 0)}
              onClick={submit}
            >
              {busy ? 'Saving…' : 'Raise Transfer'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      {/* Receive goods */}
      <Modal open={Boolean(receiving)} title={`Receive ${receiving?.transferNumber || ''}`} onClose={() => setReceiving(null)} maxWidth="md">
        {receiving && (
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Enter what actually arrived. Anything short of the dispatched quantity leaves the transfer
              partially received, so the missing units stay visible.
            </Alert>

            <DocumentLines
              lines={receiving.lines}
              onChange={(lines) => setReceiving({ ...receiving, lines })}
              products={products}
              readOnly={false}
              columns={[
                { key: 'outstanding', label: 'Dispatched', readOnly: true },
                { key: 'receivedQty', label: 'Received', inputProps: { min: 0, step: 'any' } },
                { key: 'damagedQty', label: 'Damaged', inputProps: { min: 0, step: 'any' } },
              ]}
            />

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setReceiving(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy} onClick={submitReceive} sx={{ borderRadius: 2 }}>
                {busy ? 'Receiving…' : 'Confirm Receipt'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Detail */}
      <Modal open={Boolean(viewing)} title={viewing?.transferNumber || ''} onClose={() => setViewing(null)} maxWidth="md">
        {viewing && (
          <Stack spacing={2}>
            <Grid container spacing={1}>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">From</Typography><Typography variant="body2" fontWeight={600}>{viewing.fromBranch?.branchName}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">To</Typography><Typography variant="body2" fontWeight={600}>{viewing.toBranch?.branchName}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Date</Typography><Typography variant="body2" fontWeight={600}>{viewing.transferDate}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Status</Typography><Box><StatusChip status={viewing.status} /></Box></Grid>
            </Grid>

            <DocumentLines
              lines={viewing.StockTransferItems || []}
              onChange={() => {}}
              products={products}
              readOnly
              columns={[
                { key: 'quantity', label: 'Requested' },
                { key: 'dispatchedQty', label: 'Dispatched' },
                { key: 'receivedQty', label: 'Received' },
                { key: 'damagedQty', label: 'Damaged' },
              ]}
            />

            {viewing.remarks && (
              <Typography variant="body2" color="text.secondary">{viewing.remarks}</Typography>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
