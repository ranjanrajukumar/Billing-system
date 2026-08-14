import AddIcon from '@mui/icons-material/Add';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert, Box, Button, Chip, Grid, IconButton, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { currency } from '../utils/formatters.js';
import { warehousesApi } from '../services/resource.service.js';

/**
 * Warehouses, and the zone/rack/shelf/bin tree inside them.
 *
 * A warehouse is a stock location like a branch — it just stores rather than
 * sells. The bin tree is entirely optional: stock lives at the location, and a
 * bin only says where in the building to go looking for it.
 */
const BIN_LEVELS = ['Zone', 'Rack', 'Shelf', 'Bin'];

export default function Warehouses() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [detail, setDetail] = useState(null);
  const [contents, setContents] = useState([]);
  const [valuation, setValuation] = useState(null);
  const [newBin, setNewBin] = useState({ level: 'Zone', code: '', name: '', parentId: '' });
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const list = await warehousesApi.list({ limit: 100 });
      setRows(list?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load warehouses', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openForm = (row = null) => setEditing(row ? { ...row } : {
    branchName: '', branchCode: '', locationType: 'Warehouse',
    city: '', state: '', address: '', phone: '', canSell: false,
  });

  const save = async () => {
    setBusy(true);
    try {
      if (editing.id) await warehousesApi.update(editing.id, editing);
      else await warehousesApi.create(editing);
      showToast('Location saved');
      setEditing(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the location', 'error');
    }
    setBusy(false);
  };

  const remove = async () => {
    try {
      await warehousesApi.remove(deleting.id);
      showToast('Location removed');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove the location', 'error');
    }
    setDeleting(null);
    load();
  };

  const openDetail = async (row) => {
    try {
      const [full, held, value] = await Promise.all([
        warehousesApi.get(row.id),
        warehousesApi.contents(row.id, { limit: 200 }),
        warehousesApi.valuation(row.id),
      ]);
      setDetail(full);
      setContents(held?.data || []);
      setValuation(value);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open that location', 'error');
    }
  };

  const addBin = async () => {
    setBusy(true);
    try {
      await warehousesApi.createBin(detail.id, {
        ...newBin,
        parentId: newBin.parentId || null,
      });
      showToast('Storage location added');
      setNewBin({ level: 'Zone', code: '', name: '', parentId: '' });
      openDetail(detail);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not add the storage location', 'error');
    }
    setBusy(false);
  };

  const removeBin = async (binId) => {
    try {
      await warehousesApi.removeBin(detail.id, binId);
      openDetail(detail);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove it', 'error');
    }
  };

  /** Renders the bin tree with indentation for depth. */
  const renderBins = (bins, depth = 0) => bins.flatMap((bin) => [
    <TableRow key={bin.id} hover>
      <TableCell sx={{ pl: 2 + depth * 3 }}>
        <Chip label={bin.level} size="small" variant="outlined" sx={{ mr: 1, fontSize: '0.65rem' }} />
        <Typography component="span" variant="body2" fontWeight={600}>{bin.code}</Typography>
        {bin.name && <Typography component="span" variant="caption" color="text.secondary"> — {bin.name}</Typography>}
      </TableCell>
      <TableCell align="right">
        <IconButton size="small" color="error" onClick={() => removeBin(bin.id)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>,
    ...renderBins(bin.children || [], depth + 1),
  ]);

  const flatBins = (bins = [], out = []) => {
    for (const bin of bins) { out.push(bin); flatBins(bin.children || [], out); }
    return out;
  };

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Warehouses"
        subtitle="Storage locations, what they hold, and how they are laid out inside"
        icon={<WarehouseIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>Add Warehouse</Button>}
      />

      <Alert severity="info" sx={{ borderRadius: 2 }}>
        A warehouse holds stock exactly as a branch does, so transfers, receipts and counts all work against it.
        It is excluded from billing screens because it stores rather than sells.
      </Alert>

      <Grid container spacing={2}>
        <Grid item xs={6} sm={6}>
          <StatsCard title="Warehouses" value={rows.length} detail="Storage locations" icon={<WarehouseIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} sm={6}>
          <StatsCard
            title="Stock held"
            value={rows.reduce((s, r) => s + Number(r.totalStock || 0), 0)}
            detail="Units across warehouses" icon={<WarehouseIcon />} gradient="info"
          />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="branchName"
          rows={rows}
          columns={[
            { field: 'branchName', headerName: 'Warehouse', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.branchName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {[r.city, r.state].filter(Boolean).join(', ') || '—'}
                </Typography>
              </Box>
            )},
            { field: 'branchCode', headerName: 'Code', render: (r) => (
              <Chip label={r.branchCode} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }} />
            )},
            { field: 'totalStock', headerName: 'Stock', render: (r) => (
              <Typography fontWeight={700}>{Number(r.totalStock || 0)}</Typography>
            )},
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5}>
                <Button size="small" onClick={() => openDetail(r)}>Open</Button>
                <Button size="small" onClick={() => openForm(r)}>Edit</Button>
                <Tooltip title="Delete">
                  <IconButton size="small" color="error" onClick={() => setDeleting(r)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )},
          ]}
        />
      )}

      {/* Add / edit */}
      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit Location' : 'Add Warehouse'} onClose={() => setEditing(null)} maxWidth="sm">
        {editing && (
          <Stack spacing={2}>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={7}>
                <TextField fullWidth size="small" label="Name" value={editing.branchName || ''}
                  onChange={(e) => setEditing({ ...editing, branchName: e.target.value })}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={5}>
                <TextField fullWidth size="small" label="Code" value={editing.branchCode || ''}
                  onChange={(e) => setEditing({ ...editing, branchCode: e.target.value })}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth size="small" label="Type" value={editing.locationType || 'Warehouse'}
                  onChange={(e) => setEditing({ ...editing, locationType: e.target.value })}
                  InputLabelProps={{ shrink: true }}>
                  <MenuItem value="Warehouse">Warehouse (stores)</MenuItem>
                  <MenuItem value="Branch">Branch (sells)</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="Phone" value={editing.phone || ''}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth size="small" label="Address" multiline minRows={2} value={editing.address || ''}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth size="small" label="City" value={editing.city || ''}
                  onChange={(e) => setEditing({ ...editing, city: e.target.value })}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth size="small" label="State" value={editing.state || ''}
                  onChange={(e) => setEditing({ ...editing, state: e.target.value })}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
            </Grid>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy || !editing.branchName || !editing.branchCode}
                onClick={save} sx={{ borderRadius: 2 }}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Detail: contents + bin tree */}
      <Modal open={Boolean(detail)} title={detail?.branchName || ''} onClose={() => setDetail(null)} maxWidth="lg">
        {detail && (
          <Stack spacing={2}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <StatsCard title="Lines held" value={contents.length} detail="Distinct products" icon={<WarehouseIcon />} gradient="primary" />
              </Grid>
              <Grid item xs={6} sm={4}>
                <StatsCard title="At cost" value={currency(valuation?.costValue || 0)} detail="Stock value" icon={<WarehouseIcon />} gradient="info" />
              </Grid>
              <Grid item xs={6} sm={4}>
                <StatsCard title="At sale price" value={currency(valuation?.saleValue || 0)} detail="If all sold" icon={<WarehouseIcon />} gradient="success" />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" fontWeight={700}>Stock held here</Typography>
            <Paper variant="outlined" sx={{ borderRadius: 2, maxHeight: 260, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Quantity</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contents.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Typography variant="body2">{row.Product?.productName}</Typography>
                        {row.Product?.sku && <Typography variant="caption" color="text.secondary">{row.Product.sku}</Typography>}
                      </TableCell>
                      <TableCell align="right"><Typography fontWeight={700}>{Number(row.stock)}</Typography></TableCell>
                    </TableRow>
                  ))}
                  {!contents.length && (
                    <TableRow><TableCell colSpan={2}>
                      <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                        Nothing held here yet.
                      </Typography>
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>

            <Typography variant="subtitle2" fontWeight={700}>Storage layout (optional)</Typography>
            <Paper variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableBody>
                  {renderBins(detail.bins || [])}
                  {!(detail.bins || []).length && (
                    <TableRow><TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        No zones or bins defined. Small operations can leave this empty.
                      </Typography>
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>

            <Grid container spacing={1} alignItems="center">
              <Grid item xs={6} sm={2}>
                <TextField select fullWidth size="small" label="Level" value={newBin.level}
                  onChange={(e) => setNewBin({ ...newBin, level: e.target.value })} InputLabelProps={{ shrink: true }}>
                  {BIN_LEVELS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField fullWidth size="small" label="Code" value={newBin.code}
                  onChange={(e) => setNewBin({ ...newBin, code: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth size="small" label="Name" value={newBin.name}
                  onChange={(e) => setNewBin({ ...newBin, name: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField select fullWidth size="small" label="Inside" value={newBin.parentId}
                  onChange={(e) => setNewBin({ ...newBin, parentId: e.target.value })} InputLabelProps={{ shrink: true }}>
                  <MenuItem value=""><em>Top level</em></MenuItem>
                  {flatBins(detail.bins).map((b) => (
                    <MenuItem key={b.id} value={b.id}>{b.level} {b.code}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={2}>
                <Button fullWidth variant="outlined" disabled={busy || !newBin.code} onClick={addBin} sx={{ borderRadius: 2 }}>
                  Add
                </Button>
              </Grid>
            </Grid>
          </Stack>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Location"
        message={`Delete "${deleting?.branchName}"? Any stock it holds must be transferred out first.`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
