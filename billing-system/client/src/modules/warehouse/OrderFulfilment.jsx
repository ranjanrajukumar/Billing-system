import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import {
  Alert, Box, Button, Chip, Grid, LinearProgress, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { fulfilmentApi } from '../../services/resource.service.js';

/**
 * Fulfilling sales orders: allocate → pick → pack → dispatch.
 *
 * The row shows how far each order has got, and the button offers only the
 * next step. Presenting all four actions at once invites somebody to dispatch
 * an order nobody has picked, so the screen simply does not offer it.
 *
 * Stock leaves the location at dispatch and nowhere else — the earlier steps
 * move goods around inside the building, which is why the shelf figure does
 * not change until the last one.
 */

/** The one action that makes sense next, given where the order has got to. */
const NEXT_STEP = {
  Pending: { action: 'allocate', label: 'Allocate' },
  Allocated: { action: 'pick', label: 'Pick' },
  Picking: { action: 'pick', label: 'Continue picking' },
  Picked: { action: 'pack', label: 'Pack' },
  Packed: { action: 'pack', label: 'Pack more' },
  ReadyToShip: { action: 'dispatch', label: 'Dispatch' },
  Dispatched: { action: 'track', label: 'Update delivery' },
  InTransit: { action: 'track', label: 'Update delivery' },
};

export default function OrderFulfilment({ branchId, onChanged }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickList, setPickList] = useState(null);
  const [packing, setPacking] = useState(null);
  const [shipping, setShipping] = useState(null);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const result = await fulfilmentApi.queue({
        limit: 50,
        // What this location is shipping — including orders not yet claimed by
        // any location, which is what makes them allocatable from here.
        fulfilFromBranchId: branchId || undefined,
      });
      setOrders(result?.data || []);
    } catch (err) {
      // A shop without sales orders switched on simply has no queue.
      if (err.response?.status !== 403) {
        showToast(err.response?.data?.message || 'Unable to load the order queue', 'error');
      }
      setOrders([]);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [branchId]);

  const refresh = () => { load(); onChanged?.(); };

  const allocate = async (order) => {
    setBusy(true);
    try {
      const result = await fulfilmentApi.allocate(order.id, { branchId: Number(branchId) });
      // A partial allocation is normal; saying so beats a bare "done".
      showToast(result.message, result.shortfalls?.length ? 'warning' : 'success');
      refresh();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not allocate', 'error');
    }
    setBusy(false);
  };

  const openPickList = async (order) => {
    try {
      setPickList(await fulfilmentApi.pickList(order.id));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not build the pick list', 'error');
    }
  };

  const confirmPick = async () => {
    setBusy(true);
    try {
      const result = await fulfilmentApi.pick(pickList.orderId, {
        lines: pickList.lines.map((line) => ({ itemId: line.itemId, picks: line.picks })),
      });
      showToast(result.message);
      setPickList(null);
      refresh();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not confirm the pick', 'error');
    }
    setBusy(false);
  };

  const openPacking = async (order) => {
    try {
      const [full, existing] = await Promise.all([
        fulfilmentApi.pickList(order.id),
        fulfilmentApi.packages(order.id),
      ]);
      setPacking({
        orderId: order.id,
        orderNumber: order.orderNumber,
        existing,
        packageType: 'Carton',
        weightKg: '',
        lines: full.lines.map((line) => {
          const item = (order.SalesOrderItems || []).find((i) => i.id === line.itemId);
          const toPack = Number(item?.pickedQty || 0) - Number(item?.packedQty || 0);
          return { ...line, toPack, quantity: toPack > 0 ? toPack : '' };
        }),
      });
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open packing', 'error');
    }
  };

  const confirmPack = async () => {
    setBusy(true);
    try {
      await fulfilmentApi.packCarton(packing.orderId, {
        packageType: packing.packageType,
        weightKg: packing.weightKg || null,
        items: packing.lines
          .filter((l) => Number(l.quantity) > 0)
          .map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) })),
      });
      showToast('Carton packed');
      setPacking(null);
      refresh();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not pack the carton', 'error');
    }
    setBusy(false);
  };

  const openShipping = (order) => setShipping({
    orderId: order.id,
    orderNumber: order.orderNumber,
    dispatched: ['Dispatched', 'InTransit'].includes(order.fulfilmentStatus),
    courier: order.courier || '',
    trackingNumber: order.trackingNumber || '',
    status: order.fulfilmentStatus === 'Dispatched' ? 'InTransit' : 'Delivered',
  });

  const confirmShipping = async () => {
    setBusy(true);
    try {
      if (shipping.dispatched) {
        await fulfilmentApi.shipping(shipping.orderId, {
          status: shipping.status,
          courier: shipping.courier,
          trackingNumber: shipping.trackingNumber,
        });
        showToast(`Marked ${shipping.status === 'InTransit' ? 'in transit' : 'delivered'}`);
      } else {
        const result = await fulfilmentApi.dispatch(shipping.orderId, {
          courier: shipping.courier,
          trackingNumber: shipping.trackingNumber,
        });
        showToast(result.message);
      }
      setShipping(null);
      refresh();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not update the shipment', 'error');
    }
    setBusy(false);
  };

  const cancel = async (order) => {
    if (!window.confirm(`Cancel fulfilment of ${order.orderNumber}? Picked stock goes back to its bins.`)) return;
    setBusy(true);
    try {
      const result = await fulfilmentApi.cancel(order.id);
      showToast(result.message);
      refresh();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not cancel', 'error');
    }
    setBusy(false);
  };

  const run = (order, action) => {
    if (action === 'allocate') return allocate(order);
    if (action === 'pick') return openPickList(order);
    if (action === 'pack') return openPacking(order);
    if (action === 'dispatch' || action === 'track') return openShipping(order);
    return undefined;
  };

  if (loading) return <Loader />;

  return (
    <Stack spacing={2}>
      {!orders.length ? (
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 4 }}>
          <Typography variant="body2" color="text.secondary" align="center">
            No orders waiting on the warehouse.
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Order</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 190 }}>Progress</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Stage</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Next step</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => {
                  const p = order.progress || {};
                  const next = NEXT_STEP[order.fulfilmentStatus];
                  const pct = p.ordered ? Math.round((p.dispatched / p.ordered) * 100) : 0;

                  return (
                    <TableRow key={order.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>{order.orderNumber}</Typography>
                        <Typography variant="caption" color="text.secondary">{order.orderDate}</Typography>
                      </TableCell>
                      <TableCell>{order.Customer?.customerName || '—'}</TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {p.ordered} ordered · {p.allocated} allocated · {p.picked} picked · {p.packed} packed
                        </Typography>
                        <LinearProgress
                          variant="determinate" value={pct}
                          sx={{ height: 5, borderRadius: 3, mt: 0.5 }}
                          color={pct >= 100 ? 'success' : 'primary'}
                        />
                      </TableCell>
                      <TableCell><StatusChip status={order.fulfilmentStatus} /></TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          {next && (
                            <Button
                              size="small" variant="outlined" disabled={busy}
                              onClick={() => run(order, next.action)}
                              sx={{ borderRadius: 2 }}
                            >
                              {next.label}
                            </Button>
                          )}
                          {!['Dispatched', 'InTransit', 'Delivered'].includes(order.fulfilmentStatus) && (
                            <Button size="small" color="error" disabled={busy}
                              onClick={() => cancel(order)} sx={{ borderRadius: 2 }}>
                              Cancel
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}

      {/* Pick list */}
      <Modal open={Boolean(pickList)} title={`Pick — ${pickList?.orderNumber || ''}`}
        onClose={() => setPickList(null)} maxWidth="md">
        {pickList && (
          <Stack spacing={2}>
            {pickList.note && <Alert severity="info" sx={{ borderRadius: 2 }}>{pickList.note}</Alert>}
            <Typography variant="body2" color="text.secondary">
              For {pickList.customer}
            </Typography>

            {pickList.lines.map((line) => (
              <Paper key={line.itemId} variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Box>
                    <Typography variant="body2" fontWeight={700}>{line.productName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Take {line.toPick} {line.unit}
                      {line.alreadyPicked > 0 ? ` · ${line.alreadyPicked} already picked` : ''}
                    </Typography>
                  </Box>
                  {!line.complete && line.shortfall > 0 && (
                    <Chip label={`${line.shortfall} short`} size="small" color="warning" />
                  )}
                </Stack>

                {line.picks.length ? (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Go to</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Lot</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>In bin</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Take</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {line.picks.map((pick, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Chip label={pick.binCode} size="small" sx={{ fontFamily: 'monospace' }} />
                          </TableCell>
                          <TableCell>
                            {pick.batchNumber || '—'}
                            {pick.expiryDate && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                exp {pick.expiryDate}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">{pick.available}</TableCell>
                          <TableCell align="right"><strong>{pick.pick}</strong></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {line.toPick <= 0
                      ? 'Nothing left to pick on this line.'
                      : pickList.binsInUse
                        ? 'Not in any bin — it may still be in the receiving bay.'
                        : 'No bins at this location.'}
                  </Typography>
                )}
              </Paper>
            ))}

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setPickList(null)} variant="outlined" sx={{ borderRadius: 2 }}>Close</Button>
              <Button variant="contained" disabled={busy} onClick={confirmPick} sx={{ borderRadius: 2 }}>
                {busy ? 'Confirming…' : 'Confirm pick'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Packing */}
      <Modal open={Boolean(packing)} title={`Pack — ${packing?.orderNumber || ''}`}
        onClose={() => setPacking(null)} maxWidth="md">
        {packing && (
          <Stack spacing={2}>
            {packing.existing.length > 0 && (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                Already packed: {packing.existing.map((p) => p.packageNumber).join(', ')}
              </Alert>
            )}

            <Grid container spacing={1.5}>
              <Grid item xs={6} sm={4}>
                <TextField select fullWidth size="small" label="Package type" value={packing.packageType}
                  onChange={(e) => setPacking({ ...packing, packageType: e.target.value })}
                  InputLabelProps={{ shrink: true }}>
                  {['Carton', 'Sack', 'Bundle', 'Pallet', 'Crate'].map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField fullWidth size="small" type="number" label="Weight (kg)" value={packing.weightKg}
                  onChange={(e) => setPacking({ ...packing, weightKg: e.target.value })}
                  inputProps={{ min: 0, step: 'any' }} InputLabelProps={{ shrink: true }} />
              </Grid>
            </Grid>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Ready to pack</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Into this package</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {packing.lines.map((line, index) => (
                  <TableRow key={line.itemId}>
                    <TableCell>{line.productName}</TableCell>
                    <TableCell align="right">{line.toPack}</TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small" type="number" sx={{ width: 110 }}
                        value={line.quantity} disabled={line.toPack <= 0}
                        onChange={(e) => setPacking({
                          ...packing,
                          lines: packing.lines.map((l, i) => (
                            i === index ? { ...l, quantity: e.target.value } : l
                          )),
                        })}
                        inputProps={{ min: 0, max: line.toPack, step: 'any', style: { textAlign: 'right' } }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setPacking(null)} variant="outlined" sx={{ borderRadius: 2 }}>Close</Button>
              <Button variant="contained" sx={{ borderRadius: 2 }}
                disabled={busy || !packing.lines.some((l) => Number(l.quantity) > 0)}
                onClick={confirmPack}>
                {busy ? 'Packing…' : 'Pack this carton'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Dispatch / delivery tracking */}
      <Modal
        open={Boolean(shipping)}
        title={`${shipping?.dispatched ? 'Delivery' : 'Dispatch'} — ${shipping?.orderNumber || ''}`}
        onClose={() => setShipping(null)}
        maxWidth="xs"
      >
        {shipping && (
          <Stack spacing={2}>
            {!shipping.dispatched && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                This is the step that takes the stock out of the warehouse. Everything before it only moved
                the goods around inside the building.
              </Alert>
            )}

            {shipping.dispatched && (
              <TextField select fullWidth size="small" label="Delivery status" value={shipping.status}
                onChange={(e) => setShipping({ ...shipping, status: e.target.value })}
                InputLabelProps={{ shrink: true }}>
                <MenuItem value="InTransit">In transit</MenuItem>
                <MenuItem value="Delivered">Delivered</MenuItem>
              </TextField>
            )}

            <TextField fullWidth size="small" label="Courier" value={shipping.courier}
              onChange={(e) => setShipping({ ...shipping, courier: e.target.value })}
              placeholder="Blue Dart, local transport…" InputLabelProps={{ shrink: true }} />
            <TextField fullWidth size="small" label="Tracking number" value={shipping.trackingNumber}
              onChange={(e) => setShipping({ ...shipping, trackingNumber: e.target.value })}
              InputLabelProps={{ shrink: true }} />

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setShipping(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy} onClick={confirmShipping}
                startIcon={shipping.dispatched ? <Inventory2Icon /> : <LocalShippingIcon />}
                sx={{ borderRadius: 2 }}>
                {busy ? 'Saving…' : shipping.dispatched ? 'Update' : 'Dispatch'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
