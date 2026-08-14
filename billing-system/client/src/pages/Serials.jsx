import AddIcon from '@mui/icons-material/Add';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import {
  Box, Button, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SearchBox from '../components/SearchBox.jsx';
import StatsCard from '../components/StatsCard.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { currency, date as fmtDate } from '../utils/formatters.js';
import { branchesApi, productsApi, serialsApi } from '../services/resource.service.js';

/**
 * Individually tracked units.
 *
 * A serial has a location and a status rather than a quantity: it is somewhere,
 * or it has been sold. Its history — bought on this receipt, moved on that
 * transfer, sold to this customer — is what a warranty claim gets answered from.
 */
const STATUSES = ['In Stock', 'Sold', 'In Transit', 'Returned', 'Damaged', 'Scrapped'];

export default function Serials() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', status: '', productId: '', branchId: '' });
  const [creating, setCreating] = useState(false);
  const [history, setHistory] = useState(null);
  const [form, setForm] = useState({ productId: '', branchId: '', serialNumbers: '', warrantyMonths: '' });
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [list, prods, locs] = await Promise.all([
        serialsApi.list({ limit: 200, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }),
        productsApi.list({ limit: 500 }),
        branchesApi.list({ limit: 200 }),
      ]);
      setRows(list?.data || []);
      setProducts(prods?.data || []);
      setLocations(locs?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load serial numbers', 'error');
    }
    setLoading(false);
  };
  // Typed search is debounced so each keystroke does not become a request.
  useEffect(() => {
    const timer = setTimeout(load, filters.search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [filters.search, filters.status, filters.productId, filters.branchId]);

  const add = async () => {
    setBusy(true);
    try {
      const result = await serialsApi.create({
        ...form,
        productId: Number(form.productId),
        branchId: form.branchId ? Number(form.branchId) : undefined,
        warrantyMonths: form.warrantyMonths ? Number(form.warrantyMonths) : undefined,
      });
      showToast(`${result.created} serial number${result.created === 1 ? '' : 's'} added`);
      setCreating(false);
      setForm({ productId: '', branchId: '', serialNumbers: '', warrantyMonths: '' });
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not add the serial numbers', 'error');
    }
    setBusy(false);
  };

  const openHistory = async (serialNumber) => {
    try {
      setHistory(await serialsApi.history(serialNumber));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not load that history', 'error');
    }
  };

  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: rows.filter((r) => r.status === s).length }), {});

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Serial Numbers"
        subtitle="Individually tracked units, from the receipt that brought them in to the customer who bought them"
        icon={<QrCode2Icon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreating(true)}>Add Serials</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}><StatsCard title="In stock" value={counts['In Stock'] || 0} detail="Available to sell" icon={<QrCode2Icon />} gradient="success" /></Grid>
        <Grid item xs={6} sm={3}><StatsCard title="Sold" value={counts.Sold || 0} detail="With customers" icon={<QrCode2Icon />} gradient="primary" /></Grid>
        <Grid item xs={6} sm={3}><StatsCard title="In transit" value={counts['In Transit'] || 0} detail="Between locations" icon={<QrCode2Icon />} gradient="info" /></Grid>
        <Grid item xs={6} sm={3}><StatsCard title="Damaged" value={(counts.Damaged || 0) + (counts.Scrapped || 0)} detail="Written off" icon={<QrCode2Icon />} gradient="danger" /></Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={4}>
            <SearchBox
              value={filters.search}
              onChange={(v) => setFilters({ ...filters, search: v })}
              placeholder="Search a serial number…"
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField select fullWidth size="small" label="Status" value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })} InputLabelProps={{ shrink: true }}>
              <MenuItem value=""><em>All</em></MenuItem>
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField select fullWidth size="small" label="Product" value={filters.productId}
              onChange={(e) => setFilters({ ...filters, productId: e.target.value })} InputLabelProps={{ shrink: true }}>
              <MenuItem value=""><em>All</em></MenuItem>
              {products.map((p) => <MenuItem key={p.id} value={p.id}>{p.productName}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField select fullWidth size="small" label="Location" value={filters.branchId}
              onChange={(e) => setFilters({ ...filters, branchId: e.target.value })} InputLabelProps={{ shrink: true }}>
              <MenuItem value=""><em>All</em></MenuItem>
              {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.branchName}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="serialNumber"
          rows={rows}
          columns={[
            { field: 'serialNumber', headerName: 'Serial', render: (r) => (
              <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{r.serialNumber}</Typography>
            )},
            { field: 'product', headerName: 'Product', render: (r) => (
              <Box>
                <Typography variant="body2">{r.Product?.productName || '—'}</Typography>
                {r.Product?.sku && <Typography variant="caption" color="text.secondary">{r.Product.sku}</Typography>}
              </Box>
            )},
            { field: 'branch', headerName: 'Location', render: (r) => r.Branch?.branchName || (r.status === 'Sold' ? 'Sold' : '—') },
            { field: 'purchaseCost', headerName: 'Cost', render: (r) => (r.purchaseCost ? currency(r.purchaseCost) : '—') },
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { field: 'actions', headerName: '', render: (r) => (
              <Button size="small" onClick={() => openHistory(r.serialNumber)}>History</Button>
            )},
          ]}
        />
      )}

      <Modal open={creating} title="Add Serial Numbers" onClose={() => setCreating(false)} maxWidth="sm">
        <Stack spacing={2}>
          <TextField select fullWidth size="small" label="Product" value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })} InputLabelProps={{ shrink: true }}>
            {products.map((p) => <MenuItem key={p.id} value={p.id}>{p.productName}</MenuItem>)}
          </TextField>
          <TextField select fullWidth size="small" label="Location" value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })} InputLabelProps={{ shrink: true }}>
            {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.branchName}</MenuItem>)}
          </TextField>
          <TextField
            fullWidth size="small" label="Serial numbers" multiline minRows={4}
            value={form.serialNumbers}
            onChange={(e) => setForm({ ...form, serialNumbers: e.target.value })}
            placeholder={'One per line, or separated by commas'}
            helperText="Scan or paste as many as you like"
            InputLabelProps={{ shrink: true }}
          />
          <TextField fullWidth size="small" type="number" label="Warranty (months)" value={form.warrantyMonths}
            onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })}
            InputLabelProps={{ shrink: true }} inputProps={{ min: 0 }} />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setCreating(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button variant="contained" disabled={busy || !form.productId || !form.serialNumbers.trim()}
              onClick={add} sx={{ borderRadius: 2 }}>
              {busy ? 'Adding…' : 'Add'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <Modal open={Boolean(history)} title={history?.serial?.serialNumber || ''} onClose={() => setHistory(null)} maxWidth="md">
        {history && (
          <Stack spacing={2}>
            <Grid container spacing={1}>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Product</Typography><Typography variant="body2" fontWeight={600}>{history.serial.Product?.productName}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Location</Typography><Typography variant="body2" fontWeight={600}>{history.serial.Branch?.branchName || '—'}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Warranty to</Typography><Typography variant="body2" fontWeight={600}>{history.serial.warrantyExpiry ? fmtDate(history.serial.warrantyExpiry) : '—'}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Status</Typography><Box><StatusChip status={history.serial.status} /></Box></Grid>
            </Grid>

            <Paper variant="outlined" sx={{ borderRadius: 2, maxHeight: 320, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Movement</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Reference</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Note</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.movements.map((m) => (
                    <TableRow key={m.id} hover>
                      <TableCell>{fmtDate(m.transactionDate || m.addondt)}</TableCell>
                      <TableCell>{m.movementType}</TableCell>
                      <TableCell>{m.referenceNumber || m.referenceType || '—'}</TableCell>
                      <TableCell>{m.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {!history.movements.length && (
                    <TableRow><TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                        No movements recorded against this unit yet.
                      </Typography>
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
