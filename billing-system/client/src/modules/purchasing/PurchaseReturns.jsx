import AddIcon from '@mui/icons-material/Add';
import UndoIcon from '@mui/icons-material/Undo';
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
import {
  branchesApi, productsApi, purchaseReturnsApi, purchasesApi, suppliersApi,
} from '../../services/resource.service.js';

/**
 * Goods going back to a supplier.
 *
 * The original purchase is never edited. Confirming a return takes the stock
 * out and raises a debit note, so what was bought and what was sent back both
 * stay on the record — which is what a supplier dispute is argued from.
 */
export default function PurchaseReturns() {
  const [rows, setRows] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  // Goods go back to a named supplier from a named location for a stated
  // reason. A return with no reason is an unexplained stock loss.
  const returnFields = useRequiredFields([
    { name: 'supplierId', label: 'Supplier' },
    { name: 'branchId', label: 'Location' },
    { name: 'returnDate', label: 'Return date' },
    { name: 'reason', label: 'Reason' },
  ]);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [list, purch, sups, prods, locs] = await Promise.all([
        purchaseReturnsApi.list({ limit: 100 }),
        purchasesApi.list({ limit: 200 }),
        suppliersApi.list({ limit: 300 }),
        productsApi.list({ limit: 500 }),
        branchesApi.list({ limit: 200 }),
      ]);
      setRows(list?.data || []);
      setPurchases(purch?.data || []);
      setSuppliers(sups?.data || []);
      setProducts(prods?.data || []);
      setLocations(locs?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load returns', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openBlank = () => setCreating({
    purchaseId: '', supplierId: '', branchId: '',
    returnDate: new Date().toISOString().slice(0, 10), reason: '', notes: '',
    items: [{ productId: '', quantity: '', rate: '', gstPercent: '' }],
  });

  /** Loads what is still returnable from the chosen purchase. */
  const choosePurchase = async (purchaseId) => {
    if (!purchaseId) { setCreating((c) => ({ ...c, purchaseId: '' })); return; }
    try {
      const detail = await purchaseReturnsApi.returnable(purchaseId);
      setCreating((c) => ({
        ...c,
        purchaseId,
        supplierId: detail.supplierId,
        branchId: detail.branchId,
        items: detail.items.map((i) => ({
          purchaseItemId: i.purchaseItemId,
          productId: i.productId,
          returnableQty: i.returnableQty,
          quantity: '',
          rate: i.rate,
          gstPercent: i.gstPercent,
          um: i.um,
          batchNumber: i.batchNumber,
        })),
      }));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not load that purchase', 'error');
    }
  };

  const lineValue = (line) => {
    const taxable = Number(line.quantity || 0) * Number(line.rate || 0);
    return taxable + taxable * Number(line.gstPercent || 0) / 100;
  };

  const submit = async () => {
    if (!returnFields.check(creating, showToast)) return;

    if (!creating.items || !creating.items.some(i => i.productId && Number(i.quantity) > 0)) {
      showToast('Add at least one product with quantity > 0', 'error'); return;
    }
    const invalid = creating.items.filter(i => i.productId && Number(i.quantity) > 0).find(i => Number(i.rate) < 0 || Number(i.gstPercent) < 0 || Number(i.gstPercent) > 100);
    if (invalid) { showToast('Invalid rate or GST percentage in line items', 'error'); return; }
    setBusy(true);
    try {
      await purchaseReturnsApi.create({
        ...creating,
        purchaseId: creating.purchaseId || undefined,
        supplierId: Number(creating.supplierId),
        branchId: Number(creating.branchId),
        items: creating.items
          .filter((i) => i.productId && Number(i.quantity) > 0)
          .map((i) => ({
            ...i,
            productId: Number(i.productId),
            quantity: Number(i.quantity),
            rate: Number(i.rate || 0),
            gstPercent: Number(i.gstPercent || 0),
          })),
      });
      showToast('Return saved as a draft — confirm it to move the stock');
      setCreating(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the return', 'error');
    }
    setBusy(false);
  };

  const act = async (row, action) => {
    setBusy(true);
    try {
      await purchaseReturnsApi[action](row.id);
      showToast(action === 'confirm'
        ? 'Return confirmed — stock removed and debit note raised'
        : 'Return cancelled');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || `Could not ${action} the return`, 'error');
    }
    setBusy(false);
  };

  const confirmed = rows.filter((r) => r.status === 'Confirmed');

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Purchase Returns"
        subtitle="Goods sent back to suppliers, with a debit note against their account"
        icon={<UndoIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={openBlank}>New Return</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Drafts" value={rows.filter((r) => r.status === 'Draft').length} detail="Not yet confirmed" icon={<UndoIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Confirmed" value={confirmed.length} detail="Stock returned" icon={<UndoIcon />} gradient="success" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard
            title="Credit due"
            value={currency(confirmed.reduce((s, r) => s + Number(r.grandTotal || 0), 0))}
            detail="Owed back by suppliers" icon={<UndoIcon />} gradient="primary"
          />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="returnNumber"
          rows={rows}
          columns={[
            { field: 'returnNumber', headerName: 'Return', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.returnNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{r.returnDate}</Typography>
              </Box>
            )},
            { field: 'supplier', headerName: 'Supplier', render: (r) => r.Supplier?.supplierName || '—' },
            { field: 'against', headerName: 'Against', render: (r) => r.Purchase?.purchaseNumber || 'Direct' },
            { field: 'grandTotal', headerName: 'Value', render: (r) => (
              <Typography fontWeight={700}>{currency(r.grandTotal)}</Typography>
            )},
            { field: 'debitNoteNumber', headerName: 'Debit note', render: (r) => r.debitNoteNumber || '—' },
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5}>
                <Button size="small" onClick={() => purchaseReturnsApi.get(r.id).then(setViewing)}>View</Button>
                {r.status === 'Draft' && (
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => act(r, 'confirm')}>Confirm</Button>
                )}
                {r.status !== 'Cancelled' && (
                  <Button size="small" color="error" disabled={busy} onClick={() => act(r, 'cancel')}>Cancel</Button>
                )}
              </Stack>
            )},
          ]}
        />
      )}

      <Modal open={Boolean(creating)} title="New Purchase Return" onClose={() => setCreating(null)} maxWidth="md">
        {creating && (
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Choosing a purchase limits each line to what is still returnable against it.
            </Alert>

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}>
                <TextField
                  select fullWidth size="small" label="Against purchase" value={creating.purchaseId || ''}
                  onChange={(e) => choosePurchase(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem value=""><em>Direct return</em></MenuItem>
                  {purchases.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.purchaseNumber} — {p.Supplier?.supplierName}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  select fullWidth size="small" label="Supplier" {...returnFields.fieldProps('supplierId', creating)} value={creating.supplierId || ''}
                  onChange={(e) => setCreating({ ...creating, supplierId: e.target.value })}
                  InputLabelProps={{ shrink: true }} disabled={Boolean(creating.purchaseId)}
                >
                  {suppliers.map((s) => <MenuItem key={s.id} value={s.id}>{s.supplierName}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  select fullWidth size="small" label="From location" {...returnFields.fieldProps('branchId', creating)} value={creating.branchId || ''}
                  onChange={(e) => setCreating({ ...creating, branchId: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                >
                  {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.branchName}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" type="date" label="Return date" {...returnFields.fieldProps('returnDate', creating)} value={creating.returnDate}
                  onChange={(e) => setCreating({ ...creating, returnDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" label="Reason" {...returnFields.fieldProps('reason', creating)} value={creating.reason}
                  onChange={(e) => setCreating({ ...creating, reason: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  placeholder="Damaged in transit, wrong item, quality…"
                />
              </Grid>
            </Grid>

            <DocumentLines
              lines={creating.items}
              onChange={(items) => setCreating({ ...creating, items })}
              products={products}
              emptyLine={{ quantity: '', rate: '', gstPercent: '' }}
              columns={[
                { key: 'returnableQty', label: 'Returnable', readOnly: true, width: 100 },
                { key: 'quantity', label: 'Return qty', inputProps: { min: 0, step: 'any' } },
                { key: 'rate', label: 'Rate', inputProps: { min: 0, step: 'any' } },
                { key: 'gstPercent', label: 'GST %', inputProps: { min: 0, step: 'any' } },
                { key: 'value', label: 'Value', render: (l) => (
                  <Typography variant="body2" fontWeight={600}>{currency(lineValue(l))}</Typography>
                )},
              ]}
              footer={
                <Typography variant="body2">
                  Return value:{' '}
                  <strong>{currency(creating.items.reduce((s, i) => s + lineValue(i), 0))}</strong>
                </Typography>
              }
            />

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setCreating(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button
                variant="contained" sx={{ borderRadius: 2 }}
                disabled={busy || !creating.supplierId || !creating.branchId
                  || !creating.items.some((i) => i.productId && Number(i.quantity) > 0)}
                onClick={submit}
              >
                {busy ? 'Saving…' : 'Save Return'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      <Modal open={Boolean(viewing)} title={viewing?.returnNumber || ''} onClose={() => setViewing(null)} maxWidth="md">
        {viewing && (
          <Stack spacing={2}>
            <Grid container spacing={1}>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Supplier</Typography><Typography variant="body2" fontWeight={600}>{viewing.Supplier?.supplierName}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Debit note</Typography><Typography variant="body2" fontWeight={600}>{viewing.debitNoteNumber || '—'}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Value</Typography><Typography variant="body2" fontWeight={600}>{currency(viewing.grandTotal)}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Status</Typography><Box><StatusChip status={viewing.status} /></Box></Grid>
            </Grid>
            <DocumentLines
              lines={viewing.PurchaseReturnItems || []}
              onChange={() => {}} products={products} readOnly
              columns={[
                { key: 'quantity', label: 'Qty' },
                { key: 'rate', label: 'Rate' },
                { key: 'gstPercent', label: 'GST %' },
                { key: 'amount', label: 'Amount', render: (l) => currency(l.amount) },
              ]}
            />
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
