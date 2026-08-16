import AddIcon from '@mui/icons-material/Add';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import {
  Alert, Box, Button, Grid, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
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
import {
  branchesApi, grnApi, productsApi, purchaseOrdersApi, suppliersApi, warehouseOpsApi,
} from '../services/resource.service.js';
import SearchableSelect from '../components/SearchableSelect.jsx';

/**
 * Goods Receipt Notes.
 *
 * The screen exists to make one distinction impossible to miss: received is not
 * accepted. Only the accepted quantity becomes sellable stock; what was
 * rejected or damaged is recorded against the supplier instead of quietly
 * disappearing into the total.
 */
export default function Grn() {
  const [rows, setRows] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [putAway, setPutAway] = useState(null);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [list, pos, sups, prods, locs] = await Promise.all([
        grnApi.list({ limit: 100 }),
        purchaseOrdersApi.list({ limit: 200, pending: 'true' }),
        suppliersApi.list({ limit: 300 }),
        productsApi.list({ limit: 500 }),
        branchesApi.list({ limit: 200 }),
      ]);
      setRows(list?.data || []);
      setOrders(pos?.data || []);
      setSuppliers(sups?.data || []);
      setProducts(prods?.data || []);
      setLocations(locs?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load receipts', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openBlank = () => setCreating({
    poId: '', supplierId: '', branchId: '',
    grnDate: new Date().toISOString().slice(0, 10),
    supplierInvoiceNo: '', vehicleNo: '', remarks: '',
    items: [{ productId: '', receivedQty: '', acceptedQty: '', rejectedQty: 0, damagedQty: 0 }],
  });

  /** Prefills the receipt from what the chosen order is still owed. */
  const chooseOrder = async (poId) => {
    if (!poId) { setCreating((c) => ({ ...c, poId: '' })); return; }
    try {
      const detail = await purchaseOrdersApi.pendingItems(poId);
      setCreating((c) => ({
        ...c,
        poId,
        supplierId: detail.supplierId,
        branchId: detail.branchId,
        items: detail.items.map((i) => ({
          poItemId: i.poItemId,
          productId: i.productId,
          orderedQty: i.orderedQty,
          pendingQty: i.pendingQty,
          // Defaulting to the full outstanding quantity is what usually happens;
          // the user corrects it when the delivery is short.
          receivedQty: i.pendingQty,
          acceptedQty: i.pendingQty,
          rejectedQty: 0,
          damagedQty: 0,
          rate: i.rate,
          gstPercent: i.gstPercent,
          um: i.um,
        })),
      }));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not load the order', 'error');
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await grnApi.create({
        ...creating,
        poId: creating.poId || undefined,
        supplierId: Number(creating.supplierId),
        branchId: Number(creating.branchId),
        items: creating.items
          .filter((i) => i.productId && Number(i.receivedQty) > 0)
          .map((i) => ({
            ...i,
            productId: Number(i.productId),
            receivedQty: Number(i.receivedQty),
            acceptedQty: Number(i.acceptedQty ?? i.receivedQty),
            rejectedQty: Number(i.rejectedQty || 0),
            damagedQty: Number(i.damagedQty || 0),
            rate: Number(i.rate || 0),
            gstPercent: Number(i.gstPercent || 0),
          })),
      });
      showToast('Receipt recorded as a draft — post it to move the stock');
      setCreating(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not record the receipt', 'error');
    }
    setBusy(false);
  };

  /**
   * Hands a posted receipt straight to put-away.
   *
   * Goods that are in stock but not on a shelf are the commonest way a
   * warehouse loses track of something, so the step that fixes it belongs on
   * the receipt itself rather than on a screen somebody has to remember.
   */
  const openPutAway = async (row) => {
    try {
      const plan = await warehouseOpsApi.putAwayForGrn(row.id);
      setPutAway({
        ...plan,
        lines: plan.items.map((item) => ({
          ...item,
          binId: item.suggestedBins?.[0]?.binId || '',
          quantity: item.toPutAway,
        })),
      });
    } catch (err) {
      // A shop with no bins has nothing to put away into; say so plainly.
      showToast(
        err.response?.status === 403
          ? 'Bins are not enabled for this company, so there is nothing to put away'
          : err.response?.data?.message || 'Could not open put-away',
        err.response?.status === 403 ? 'info' : 'error',
      );
    }
  };

  const confirmPutAway = async () => {
    setBusy(true);
    try {
      const lines = putAway.lines.filter((l) => l.binId && Number(l.quantity) > 0);
      if (!lines.length) { showToast('Choose a bin and a quantity first', 'error'); setBusy(false); return; }

      const result = await warehouseOpsApi.putAway({
        branchId: putAway.branchId,
        items: lines.map((l) => ({
          binId: Number(l.binId),
          productId: l.productId,
          batchId: l.batchId || null,
          quantity: Number(l.quantity),
        })),
      });
      showToast(result.warning || `Put away ${lines.length} line(s)`);
      setPutAway(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not put it away', 'error');
    }
    setBusy(false);
  };

  const act = async (row, action) => {
    setBusy(true);
    try {
      await grnApi[action](row.id);
      showToast(action === 'post'
        ? 'Posted — accepted quantities are now in stock'
        : action === 'invoice' ? 'Purchase invoice raised from this receipt' : 'Receipt cancelled');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || `Could not ${action} the receipt`, 'error');
    }
    setBusy(false);
  };

  const drafts = rows.filter((r) => !r.postedAt && r.status !== 'Cancelled');
  const posted = rows.filter((r) => r.postedAt);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Goods Receipt (GRN)"
        subtitle="Record what arrived, what was accepted, and what went back"
        icon={<MoveToInboxIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={openBlank}>New Receipt</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Unposted" value={drafts.length} detail="Not yet in stock" icon={<MoveToInboxIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Posted" value={posted.length} detail="Stock updated" icon={<MoveToInboxIcon />} gradient="success" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Open orders" value={orders.length} detail="Awaiting delivery" icon={<MoveToInboxIcon />} gradient="info" />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="grnNumber"
          rows={rows}
          columns={[
            { field: 'grnNumber', headerName: 'GRN', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.grnNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{r.grnDate}</Typography>
              </Box>
            )},
            { field: 'supplier', headerName: 'Supplier', render: (r) => r.Supplier?.supplierName || '—' },
            { field: 'po', headerName: 'Against', render: (r) => r.PurchaseOrder?.poNumber || 'Direct' },
            { field: 'qty', headerName: 'Accepted', render: (r) => {
              const items = r.GrnItems || [];
              const received = items.reduce((s, i) => s + Number(i.receivedQty || 0), 0);
              const accepted = items.reduce((s, i) => s + Number(i.acceptedQty || 0), 0);
              return (
                <Box>
                  <Typography fontWeight={700} variant="body2">{accepted}</Typography>
                  {accepted !== received && (
                    <Typography variant="caption" color="warning.main">of {received} received</Typography>
                  )}
                </Box>
              );
            }},
            { field: 'status', headerName: 'Status', render: (r) => (
              <StatusChip status={r.postedAt ? 'Completed' : r.status} />
            )},
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                <Button size="small" onClick={() => grnApi.get(r.id).then(setViewing)}>View</Button>
                {!r.postedAt && r.status !== 'Cancelled' && (
                  <>
                    <Button size="small" variant="outlined" disabled={busy} onClick={() => act(r, 'post')}>
                      Post to Stock
                    </Button>
                    <Button size="small" color="error" disabled={busy} onClick={() => act(r, 'cancel')}>
                      Cancel
                    </Button>
                  </>
                )}
                {r.postedAt && (
                  <Button size="small" onClick={() => openPutAway(r)}>Put away</Button>
                )}
                {r.postedAt && !r.purchaseId && (
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => act(r, 'invoice')}>
                    Raise Invoice
                  </Button>
                )}
              </Stack>
            )},
          ]}
        />
      )}

      <Modal open={Boolean(creating)} title="New Goods Receipt" onClose={() => setCreating(null)} maxWidth="lg">
        {creating && (
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Only the <strong>accepted</strong> quantity enters stock. Record rejects and damage separately so
              the supplier's delivery record stays honest.
            </Alert>

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}>
                <TextField
                  select fullWidth size="small" label="Against purchase order" value={creating.poId || ''}
                  onChange={(e) => chooseOrder(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem value=""><em>Direct receipt (no order)</em></MenuItem>
                  {orders.map((o) => (
                    <MenuItem key={o.id} value={o.id}>{o.poNumber} — {o.Supplier?.supplierName}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <SearchableSelect
                  options={suppliers}
                  label="Supplier"
                  size="small"
                  value={suppliers.find(s => String(s.id) === String(creating.supplierId)) || null}
                  onChange={(selected) => setCreating({ ...creating, supplierId: selected ? selected.id : '' })}
                  getOptionLabel={(s) => s.supplierName}
                  getOptionKey={(s) => s.id}
                  disabled={Boolean(creating.poId)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  select fullWidth size="small" label="Received at" value={creating.branchId || ''}
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
                  fullWidth size="small" type="date" label="Receipt date" value={creating.grnDate}
                  onChange={(e) => setCreating({ ...creating, grnDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth size="small" label="Supplier invoice no" value={creating.supplierInvoiceNo}
                  onChange={(e) => setCreating({ ...creating, supplierInvoiceNo: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth size="small" label="Vehicle no" value={creating.vehicleNo}
                  onChange={(e) => setCreating({ ...creating, vehicleNo: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>

            <DocumentLines
              lines={creating.items}
              onChange={(items) => setCreating({ ...creating, items })}
              products={products}
              emptyLine={{ receivedQty: '', acceptedQty: '', rejectedQty: 0, damagedQty: 0, rate: '', gstPercent: '' }}
              columns={[
                { key: 'pendingQty', label: 'Ordered', readOnly: true, width: 90 },
                { key: 'receivedQty', label: 'Received', width: 100, inputProps: { min: 0, step: 'any' } },
                { key: 'acceptedQty', label: 'Accepted', width: 100, inputProps: { min: 0, step: 'any' } },
                { key: 'rejectedQty', label: 'Rejected', width: 95, inputProps: { min: 0, step: 'any' } },
                { key: 'damagedQty', label: 'Damaged', width: 95, inputProps: { min: 0, step: 'any' } },
                { key: 'rate', label: 'Rate', width: 90, inputProps: { min: 0, step: 'any' } },
                { key: 'batchNumber', label: 'Batch', type: 'text', align: 'left', width: 110 },
                { key: 'expiryDate', label: 'Expiry', type: 'date', width: 140 },
              ]}
              footer={
                <Typography variant="body2">
                  Entering stock:{' '}
                  <strong>{creating.items.reduce((s, i) => s + Number(i.acceptedQty || 0), 0)}</strong> units
                </Typography>
              }
            />

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setCreating(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button
                variant="contained" sx={{ borderRadius: 2 }}
                disabled={busy || !creating.supplierId || !creating.branchId
                  || !creating.items.some((i) => i.productId && Number(i.receivedQty) > 0)}
                onClick={submit}
              >
                {busy ? 'Saving…' : 'Save Receipt'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Put-away straight from the receipt */}
      <Modal open={Boolean(putAway)} title={`Put away — ${putAway?.grnNumber || ''}`}
        onClose={() => setPutAway(null)} maxWidth="md">
        {putAway && (
          <Stack spacing={2}>
            {!putAway.bins?.length ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                This location has no bins set up, so the stock simply sits at the location. Add zones and
                bins under Warehouses if you want to record whereabouts in the building it is kept.
              </Alert>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                The stock is already counted at this location — this only records which shelf it went on.
              </Alert>
            )}

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>To put away</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>Into bin</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Quantity</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {putAway.lines.map((line, index) => (
                  <TableRow key={line.productId}>
                    <TableCell>
                      <Typography variant="body2">{line.productName}</Typography>
                      {line.sku && <Typography variant="caption" color="text.secondary">{line.sku}</Typography>}
                    </TableCell>
                    <TableCell align="right">{line.toPutAway}</TableCell>
                    <TableCell>
                      <TextField
                        select fullWidth size="small" value={line.binId}
                        disabled={!putAway.bins?.length || line.toPutAway <= 0}
                        onChange={(e) => setPutAway({
                          ...putAway,
                          lines: putAway.lines.map((l, i) => (i === index ? { ...l, binId: e.target.value } : l)),
                        })}
                      >
                        <MenuItem value=""><em>Leave loose</em></MenuItem>
                        {(putAway.bins || []).map((bin) => (
                          <MenuItem key={bin.id} value={bin.id}>{bin.code} — {bin.name || bin.level}</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small" type="number" sx={{ width: 110 }} value={line.quantity}
                        disabled={line.toPutAway <= 0}
                        onChange={(e) => setPutAway({
                          ...putAway,
                          lines: putAway.lines.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)),
                        })}
                        inputProps={{ min: 0, max: line.toPutAway, step: 'any', style: { textAlign: 'right' } }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setPutAway(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy || !putAway.bins?.length}
                onClick={confirmPutAway} sx={{ borderRadius: 2 }}>
                {busy ? 'Placing…' : 'Put away'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      <Modal open={Boolean(viewing)} title={viewing?.grnNumber || ''} onClose={() => setViewing(null)} maxWidth="lg">
        {viewing && (
          <Stack spacing={2}>
            <Grid container spacing={1}>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Supplier</Typography><Typography variant="body2" fontWeight={600}>{viewing.Supplier?.supplierName}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Received at</Typography><Typography variant="body2" fontWeight={600}>{viewing.Branch?.branchName}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Date</Typography><Typography variant="body2" fontWeight={600}>{viewing.grnDate}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Status</Typography><Box><StatusChip status={viewing.postedAt ? 'Completed' : viewing.status} /></Box></Grid>
            </Grid>

            <DocumentLines
              lines={viewing.GrnItems || []}
              onChange={() => {}}
              products={products}
              readOnly
              columns={[
                { key: 'orderedQty', label: 'Ordered' },
                { key: 'receivedQty', label: 'Received' },
                { key: 'acceptedQty', label: 'Accepted' },
                { key: 'rejectedQty', label: 'Rejected' },
                { key: 'damagedQty', label: 'Damaged' },
                { key: 'batchNumber', label: 'Batch', align: 'left' },
              ]}
            />
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
