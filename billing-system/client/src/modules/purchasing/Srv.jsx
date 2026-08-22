import AddIcon from '@mui/icons-material/Add';
import ReceiptIcon from '@mui/icons-material/Receipt';
import {
  Alert, Box, Button, Grid, Stack, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  productsApi, srvApi, suppliersApi,
} from '../../services/resource.service.js';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import DocumentLines, { incompleteLines } from '../../components/DocumentLines.jsx';
import useRequiredFields from '../../hooks/useRequiredFields.js';

// A receipt with no date cannot be posted to a period, and a line with no
// quantity is not a receipt of anything. The supplier stays optional: a direct
// receipt is exactly the case where there is no purchase order and sometimes no
// supplier record yet.
const SRV_REQUIRED = [{ name: 'srvDate', label: 'SRV date' }];

const SRV_COLUMNS = [
  { key: 'quantity', label: 'Qty', type: 'number', required: true, positive: true, width: '100px' },
  { key: 'unitCost', label: 'Unit Cost', type: 'number', width: '120px' },
  { key: 'batchNumber', label: 'Batch No', type: 'text', width: '120px' },
  { key: 'expiryDate', label: 'Expiry Date', type: 'date', width: '140px' },
];

export default function Srv() {
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lineErrors, setLineErrors] = useState(false);
  const { showToast } = useToast();
  const srvFields = useRequiredFields(SRV_REQUIRED);

  const load = async () => {
    setLoading(true);
    try {
      const [list, sups, prods] = await Promise.all([
        srvApi.list({ limit: 100 }),
        suppliersApi.list({ limit: 300 }),
        productsApi.list({ limit: 500 }),
      ]);
      setRows(list?.data || []);
      setSuppliers(sups?.data || []);
      setProducts(prods?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load SRVs', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openBlank = () => { srvFields.reset(); setLineErrors(false); setCreating({
    supplierId: '',
    srvDate: new Date().toISOString().slice(0, 10),
    supplierInvoiceNo: '', supplierInvoiceDate: '', vehicleNo: '', remarks: '',
    items: [{ productId: '', quantity: '', unitCost: '', batchNumber: '', expiryDate: '' }],
  }); };

  const submit = async () => {
    if (!srvFields.check(creating, showToast)) return;

    setLineErrors(true);
    if (incompleteLines(creating.items, SRV_COLUMNS).length) {
      showToast('Every line needs a product and a quantity greater than zero', 'error');
      return;
    }
    if (!creating.items.some(i => i.productId && Number(i.quantity) > 0)) {
      showToast('Add at least one valid item', 'error');
      return;
    }
    setBusy(true);
    try {
      await srvApi.create({
        ...creating,
        supplierId: creating.supplierId ? Number(creating.supplierId) : undefined,
        items: creating.items
          .filter((i) => i.productId && Number(i.quantity) > 0)
          .map((i) => ({
            ...i,
            productId: Number(i.productId),
            quantity: Number(i.quantity),
            unitCost: i.unitCost ? Number(i.unitCost) : null,
          })),
      });
      showToast('SRV recorded as a draft — post it to update stock');
      setCreating(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not record the SRV', 'error');
    }
    setBusy(false);
  };

  const act = async (row, action) => {
    setBusy(true);
    try {
      await srvApi[action](row.id);
      showToast(action === 'confirm' ? 'Posted — quantities are now in stock' : 'SRV cancelled');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || `Could not ${action} the SRV`, 'error');
    }
    setBusy(false);
  };

  const drafts = rows.filter((r) => r.status === 'Draft');
  const posted = rows.filter((r) => r.status === 'Posted');

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Store Receipt Voucher (SRV)"
        subtitle="Directly receive stock into the warehouse"
        icon={<ReceiptIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={openBlank}>New SRV</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={6}>
          <StatsCard title="Drafts" value={drafts.length} detail="Not yet in stock" icon={<ReceiptIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} sm={6}>
          <StatsCard title="Posted" value={posted.length} detail="Stock updated" icon={<ReceiptIcon />} gradient="success" />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="srvNumber"
          rows={rows}
          columns={[
            { field: 'srvNumber', headerName: 'SRV #', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.srvNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{r.srvDate}</Typography>
              </Box>
            )},
            { field: 'supplier', headerName: 'Supplier', render: (r) => r.Supplier?.supplierName || '—' },
            { field: 'ref', headerName: 'Supplier Ref', render: (r) => r.supplierInvoiceNo || '—' },
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
          ]}
          actions={[
            { label: 'View', onClick: (r) => srvApi.get(r.id).then(setViewing) },
            { label: 'Post to Stock', onClick: (r) => act(r, 'confirm'), color: 'success', show: (r) => r.status === 'Draft' },
            { label: 'Cancel', onClick: (r) => act(r, 'remove'), color: 'error', show: (r) => r.status === 'Draft' },
          ]}
        />
      )}

      <Modal open={!!creating} onClose={() => setCreating(null)} title="New SRV" maxWidth="md">
        {creating && (
          <Stack spacing={3}>
            <Alert severity="info">A draft SRV does not move stock. Post it from the list after saving to receive the goods.</Alert>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" type="date" label="SRV Date"
                  value={creating.srvDate} onChange={(e) => setCreating({ ...creating, srvDate: e.target.value })}
                  {...srvFields.fieldProps('srvDate', creating)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                {/* SearchableSelect works in whole options and has no
                    `getOptionValue`: passing a bare id left the control unable
                    to match a selection back to its option, so the chosen
                    supplier never showed. */}
                <SearchableSelect
                  label="Supplier (Optional)" options={suppliers} size="small"
                  value={suppliers.find((s) => s.id === creating.supplierId) || null}
                  onChange={(option) => setCreating({ ...creating, supplierId: option?.id || '' })}
                  getOptionLabel={(o) => o.supplierName}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" label="Supplier Invoice No"
                  value={creating.supplierInvoiceNo} onChange={(e) => setCreating({ ...creating, supplierInvoiceNo: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" type="date" label="Supplier Invoice Date"
                  value={creating.supplierInvoiceDate} onChange={(e) => setCreating({ ...creating, supplierInvoiceDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" label="Vehicle No"
                  value={creating.vehicleNo} onChange={(e) => setCreating({ ...creating, vehicleNo: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" label="Remarks"
                  value={creating.remarks} onChange={(e) => setCreating({ ...creating, remarks: e.target.value })}
                />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" color="text.secondary" textTransform="uppercase">Received Items</Typography>
            {/* `products`, not `catalogue` — DocumentLines names the prop
                `products`, and under the wrong name it defaulted to an empty
                list, leaving the product dropdown with nothing in it. */}
            <DocumentLines
              lines={creating.items} products={products}
              showErrors={lineErrors}
              onChange={(items) => setCreating({ ...creating, items })}
              columns={SRV_COLUMNS}
            />

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button onClick={() => setCreating(null)} disabled={busy}>Cancel</Button>
              <Button variant="contained" onClick={submit} disabled={busy || !creating.items.some(i => i.productId && Number(i.quantity) > 0)}>
                {busy ? 'Saving...' : 'Save Draft'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`SRV: ${viewing?.srvNumber}`} maxWidth="md">
        {viewing && (
          <Stack spacing={3}>
            <Grid container spacing={2}>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Status</Typography><br /><StatusChip status={viewing.status} /></Grid>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Date</Typography><Typography>{viewing.srvDate}</Typography></Grid>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Supplier</Typography><Typography>{viewing.Supplier?.supplierName || '—'}</Typography></Grid>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Supplier Ref</Typography><Typography>{viewing.supplierInvoiceNo || '—'}</Typography></Grid>
              {viewing.status === 'Posted' && (
                <Grid item xs={12}><Typography variant="caption" color="text.secondary">Posted By</Typography><Typography>{viewing.receiver?.firstName} {viewing.receiver?.lastName} at {new Date(viewing.postedAt).toLocaleString()}</Typography></Grid>
              )}
            </Grid>

            <DataTable
              rows={viewing.SrvItems || []}
              columns={[
                { field: 'product', headerName: 'Product', render: (r) => r.Product?.productName },
                { field: 'qty', headerName: 'Quantity', render: (r) => r.quantity },
                { field: 'cost', headerName: 'Unit Cost', render: (r) => r.unitCost || '—' },
                { field: 'batch', headerName: 'Batch', render: (r) => r.batchNumber || '—' },
                { field: 'expiry', headerName: 'Expiry', render: (r) => r.expiryDate || '—' },
              ]}
            />
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
