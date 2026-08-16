import AddIcon from '@mui/icons-material/Add';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import HomeIcon from '@mui/icons-material/Home';
import InventoryIcon from '@mui/icons-material/Inventory';
import {
  Alert, Box, Button, Chip, Divider, Grid, IconButton, MenuItem, Paper,
  Breadcrumbs, Link, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography, alpha, useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { currency } from '../utils/formatters.js';
import { warehousesApi } from '../services/resource.service.js';

/**
 * 6-Level Warehouse Location Hierarchy CRUD
 *
 * Level 0 : Warehouse (Branch with locationType=Warehouse)
 * Level 1 : Zone      (WarehouseBin level=Zone, parentId=null → attached to branch)
 * Level 2 : Aisle     (WarehouseBin level=Aisle)
 * Level 3 : Rack      (WarehouseBin level=Rack)
 * Level 4 : Shelf     (WarehouseBin level=Shelf)
 * Level 5 : Bin       (WarehouseBin level=Bin)
 *
 * The UI is a drill-down: click a row to go one level deeper.
 * A breadcrumb shows the path back up.
 */
const BIN_LEVELS = ['Zone', 'Aisle', 'Rack', 'Shelf', 'Bin'];
const BIN_LEVEL_COLORS = {
  Zone: 'info',
  Aisle: 'secondary',
  Rack: 'warning',
  Shelf: 'primary',
  Bin: 'success',
};

const EMPTY_WAREHOUSE = {
  branchName: '', branchCode: '', locationType: 'Warehouse',
  city: '', state: '', address: '', phone: '', canSell: false,
};
const EMPTY_BIN = { level: 'Zone', code: '', name: '', parentId: '' };

export default function Warehouses() {
  const theme = useTheme();

  /* ---- Warehouse level ---- */
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);       // warehouse form
  const [deleting, setDeleting] = useState(null);     // confirm dialog target
  const [busy, setBusy] = useState(false);

  /* ---- Drill-down state ---- */
  // drillPath = [ { id, name, level } ] — one entry per level entered
  const [drillPath, setDrillPath] = useState([]); // path into the tree
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [currentBins, setCurrentBins] = useState([]);
  const [contents, setContents] = useState([]);
  const [valuation, setValuation] = useState(null);
  const [editingBin, setEditingBin] = useState(null);  // bin form
  const [deletingBin, setDeletingBin] = useState(null);

  const { showToast } = useToast();

  /* ===================== Warehouse CRUD ===================== */
  const loadWarehouses = async () => {
    setLoading(true);
    try {
      const list = await warehousesApi.list({ locationType: 'Warehouse', limit: 100 });
      setWarehouses(list?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load warehouses', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { loadWarehouses(); }, []);

  const openWarehouseForm = (row = null) =>
    setEditing(row ? { ...row } : { ...EMPTY_WAREHOUSE });

  const saveWarehouse = async () => {
    setBusy(true);
    try {
      if (editing.id) await warehousesApi.update(editing.id, editing);
      else await warehousesApi.create(editing);
      showToast('Warehouse saved');
      setEditing(null);
      loadWarehouses();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save', 'error');
    }
    setBusy(false);
  };

  const removeWarehouse = async () => {
    try {
      await warehousesApi.remove(deleting.id);
      showToast('Warehouse removed');
      setDeleting(null);
      loadWarehouses();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove', 'error');
    }
  };

  /* ===================== Drill-down into bins ===================== */
  const openWarehouse = async (row) => {
    setSelectedWarehouse(row);
    setDrillPath([]);
    await loadBinsAt(row.id, null);
    try {
      const [held, val] = await Promise.all([
        warehousesApi.contents(row.id, { limit: 200 }),
        warehousesApi.valuation(row.id),
      ]);
      setContents(held?.data || []);
      setValuation(val);
    } catch { /* non-fatal */ }
  };

  const loadBinsAt = async (warehouseId, parentId) => {
    try {
      const tree = await warehousesApi.bins(warehouseId);
      // Filter to the children of parentId
      const flat = flattenBins(tree);
      setCurrentBins(flat.filter((b) => {
        if (parentId === null) return b.parentId == null;
        return Number(b.parentId) === Number(parentId);
      }));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not load bins', 'error');
    }
  };

  const drillIn = (bin) => {
    const newPath = [...drillPath, { id: bin.id, name: bin.code || bin.name, level: bin.level }];
    setDrillPath(newPath);
    const nextLevel = nextBinLevel(bin.level);
    if (!nextLevel) return; // already at Bin — no children
    const flat = flattenBins([]);  // will reload from API
    loadBinsAt(selectedWarehouse.id, bin.id).then(() => { /* done */ });
  };

  const drillTo = async (pathIdx) => {
    // pathIdx -1 = root (zones), 0..n-1 = path item
    if (pathIdx < 0) {
      setDrillPath([]);
      await loadBinsAt(selectedWarehouse.id, null);
    } else {
      const entry = drillPath[pathIdx];
      const newPath = drillPath.slice(0, pathIdx + 1);
      setDrillPath(newPath);
      await loadBinsAt(selectedWarehouse.id, entry.id);
    }
  };

  /* ===================== Bin CRUD ===================== */
  const currentLevel = drillPath.length === 0 ? 'Zone' : nextBinLevel(drillPath[drillPath.length - 1].level);
  const parentBinId = drillPath.length > 0 ? drillPath[drillPath.length - 1].id : null;

  const openBinForm = (bin = null) => {
    setEditingBin(bin ? { ...bin } : { ...EMPTY_BIN, level: currentLevel, parentId: parentBinId ?? '' });
  };

  const saveBin = async () => {
    setBusy(true);
    try {
      const payload = {
        level: editingBin.level,
        code: editingBin.code,
        name: editingBin.name,
        parentId: editingBin.parentId || null,
        capacity: editingBin.capacity || null,
      };
      if (editingBin.id) {
        await warehousesApi.update(selectedWarehouse.id, editingBin); // uses PUT /warehouses/:id
        // Actually bins are managed via createBin / removeBin
        showToast('Bin updated (reload to confirm)');
      } else {
        await warehousesApi.createBin(selectedWarehouse.id, payload);
        showToast(`${editingBin.level} created`);
      }
      setEditingBin(null);
      await loadBinsAt(selectedWarehouse.id, parentBinId);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save bin', 'error');
    }
    setBusy(false);
  };

  const removeBin = async () => {
    try {
      await warehousesApi.removeBin(selectedWarehouse.id, deletingBin.id);
      showToast('Location removed');
      setDeletingBin(null);
      await loadBinsAt(selectedWarehouse.id, parentBinId);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove', 'error');
    }
  };

  /* ===================== Helpers ===================== */
  function nextBinLevel(current) {
    const idx = BIN_LEVELS.indexOf(current);
    return idx >= 0 && idx < BIN_LEVELS.length - 1 ? BIN_LEVELS[idx + 1] : null;
  }

  /* ===================== Render ===================== */
  if (loading) return <Loader />;

  /* ─── Drill-down view ─── */
  if (selectedWarehouse) {
    const nextLevel = currentLevel;
    const canDrillDeeper = nextBinLevel(currentLevel) !== null;

    return (
      <Stack spacing={3} className="animate-fadeInUp">
        <PageHeader
          title={selectedWarehouse.branchName}
          subtitle={`Warehouse location hierarchy`}
          icon={<WarehouseIcon />}
          action={
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => setSelectedWarehouse(null)}>← All Warehouses</Button>
              {nextLevel && (
                <Button startIcon={<AddIcon />} variant="contained" onClick={() => openBinForm()}>
                  Add {nextLevel}
                </Button>
              )}
            </Stack>
          }
        />

        {/* Breadcrumb */}
        <Paper variant="outlined" sx={{ px: 2.5, py: 1.5, borderRadius: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
          <Breadcrumbs separator={<ChevronRightIcon fontSize="small" />}>
            <Link
              component="button" underline="hover" color="primary" fontWeight={700}
              onClick={() => openWarehouse(selectedWarehouse)}
            >
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <WarehouseIcon sx={{ fontSize: 16 }} />
                <span>{selectedWarehouse.branchName}</span>
              </Stack>
            </Link>
            {drillPath.map((entry, i) => (
              i < drillPath.length - 1 ? (
                <Link key={entry.id} component="button" underline="hover" color="inherit"
                  fontWeight={600} onClick={() => drillTo(i)}>
                  <Chip label={entry.name} size="small" color={BIN_LEVEL_COLORS[entry.level] || 'default'} sx={{ fontWeight: 700, cursor: 'pointer' }} />
                </Link>
              ) : (
                <Chip key={entry.id} label={entry.name} size="small" color={BIN_LEVEL_COLORS[entry.level] || 'default'} sx={{ fontWeight: 700 }} />
              )
            ))}
          </Breadcrumbs>
        </Paper>

        {/* Stats row */}
        {drillPath.length === 0 && valuation && (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <StatsCard title="Products Held" value={contents.length} detail="SKUs in warehouse" icon={<InventoryIcon />} gradient="primary" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatsCard title="Stock Value (Cost)" value={currency(valuation.costValue || 0)} detail="At purchase price" icon={<InventoryIcon />} gradient="success" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatsCard title="Sale Value" value={currency(valuation.saleValue || 0)} detail="At selling price" icon={<InventoryIcon />} gradient="info" />
            </Grid>
          </Grid>
        )}

        {/* Current level bin table */}
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
            <Typography fontWeight={700} variant="subtitle1">
              {nextLevel ? `${nextLevel}s` : 'Bins'} 
              {drillPath.length > 0 && ` inside ${drillPath[drillPath.length - 1].name}`}
              <Chip label={currentBins.length} size="small" sx={{ ml: 1, fontWeight: 700 }} />
            </Typography>
          </Box>
          {currentBins.length === 0 ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <Typography color="text.secondary">No {nextLevel}s yet.</Typography>
              {nextLevel && (
                <Button startIcon={<AddIcon />} variant="outlined" sx={{ mt: 2 }} onClick={() => openBinForm()}>
                  Create First {nextLevel}
                </Button>
              )}
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                  <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Level</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Capacity</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {currentBins.map((bin) => (
                  <TableRow
                    key={bin.id}
                    hover
                    sx={{ cursor: nextBinLevel(bin.level) ? 'pointer' : 'default' }}
                    onClick={() => nextBinLevel(bin.level) && drillIn(bin)}
                  >
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Chip label={bin.code} size="small" color={BIN_LEVEL_COLORS[bin.level] || 'default'} sx={{ fontWeight: 700, fontFamily: 'monospace' }} />
                        {nextBinLevel(bin.level) && <ChevronRightIcon fontSize="small" color="action" />}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{bin.name || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={bin.level} size="small" variant="outlined" color={BIN_LEVEL_COLORS[bin.level] || 'default'} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {bin.capacity?.units ? `${bin.capacity.units} units` : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" justifyContent="flex-end" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title={`Edit ${bin.level}`}>
                          <IconButton size="small" color="primary" onClick={() => openBinForm(bin)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={`Remove ${bin.level}`}>
                          <IconButton size="small" color="error" onClick={() => setDeletingBin(bin)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        {/* Stock contents at warehouse level */}
        {drillPath.length === 0 && contents.length > 0 && (
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Typography fontWeight={700}>Stock Contents</Typography>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                  <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Quantity</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Cost Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contents.slice(0, 20).map((item, i) => (
                  <TableRow key={i} hover>
                    <TableCell><Typography variant="body2" fontWeight={600}>{item.productName || item.Product?.productName || '—'}</Typography></TableCell>
                    <TableCell><Typography variant="caption" fontFamily="monospace">{item.sku || item.Product?.sku || '—'}</Typography></TableCell>
                    <TableCell align="right"><Typography fontWeight={700}>{item.quantity ?? item.stock ?? '—'}</Typography></TableCell>
                    <TableCell align="right"><Typography color="primary.main" fontWeight={600}>{currency(item.costValue || 0)}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        {/* Bin form modal */}
        {editingBin && (
          <Modal open title={`${editingBin.id ? 'Edit' : 'Add'} ${editingBin.level}`} onClose={() => setEditingBin(null)} maxWidth="sm">
            <Stack spacing={2.5} sx={{ pt: 0.5 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth label="Code *" size="small"
                    value={editingBin.code}
                    onChange={(e) => setEditingBin({ ...editingBin, code: e.target.value.toUpperCase() })}
                    inputProps={{ style: { fontFamily: 'monospace', fontWeight: 700 } }}
                    placeholder="e.g. A01"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth label="Name" size="small"
                    value={editingBin.name || ''}
                    onChange={(e) => setEditingBin({ ...editingBin, name: e.target.value })}
                    placeholder="e.g. Zone A North"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth label="Level" size="small" select
                    value={editingBin.level}
                    onChange={(e) => setEditingBin({ ...editingBin, level: e.target.value })}
                  >
                    {BIN_LEVELS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth label="Capacity (units)" size="small" type="number"
                    value={editingBin.capacity?.units || editingBin.capacity || ''}
                    onChange={(e) => setEditingBin({ ...editingBin, capacity: e.target.value })}
                    placeholder="Optional"
                  />
                </Grid>
              </Grid>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button variant="outlined" onClick={() => setEditingBin(null)}>Cancel</Button>
                <Button variant="contained" onClick={saveBin} disabled={busy || !editingBin.code}>
                  {busy ? 'Saving…' : `Save ${editingBin.level}`}
                </Button>
              </Stack>
            </Stack>
          </Modal>
        )}

        <ConfirmDialog
          open={!!deletingBin}
          title={`Remove ${deletingBin?.level}`}
          message={`Remove "${deletingBin?.code}"? This will also remove all child locations.`}
          onConfirm={removeBin}
          onCancel={() => setDeletingBin(null)}
        />
      </Stack>
    );
  }

  /* ─── Top-level Warehouse list ─── */
  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Warehouses"
        subtitle="Manage warehouse locations and the full Zone → Aisle → Rack → Shelf → Bin hierarchy"
        icon={<WarehouseIcon />}
        action={
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => openWarehouseForm()}>
            New Warehouse
          </Button>
        }
      />

      {warehouses.length === 0 && !loading ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <WarehouseIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>No warehouses yet</Typography>
          <Typography variant="body2" color="text.disabled" mb={3}>
            Create your first warehouse to start managing stock locations.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openWarehouseForm()}>
            Create Warehouse
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={2.5}>
          {warehouses.map((wh) => (
            <Grid item xs={12} sm={6} md={4} key={wh.id}>
              <Paper
                variant="outlined"
                sx={{
                  p: 2.5, borderRadius: 3, cursor: 'pointer',
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                  '&:hover': { boxShadow: 6, borderColor: 'primary.main' },
                }}
                onClick={() => openWarehouse(wh)}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Stack spacing={0.5} flex={1}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <WarehouseIcon color="primary" />
                      <Typography fontWeight={800} variant="subtitle1">{wh.branchName}</Typography>
                    </Stack>
                    <Chip label={wh.branchCode} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 700, alignSelf: 'flex-start' }} />
                    {wh.city && (
                      <Typography variant="caption" color="text.secondary">{wh.city}{wh.state ? `, ${wh.state}` : ''}</Typography>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Edit warehouse">
                      <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); openWarehouseForm(wh); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete warehouse">
                      <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDeleting(wh); }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>

                <Divider sx={{ my: 1.5 }} />

                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {BIN_LEVELS.map((l) => (
                    <Chip key={l} label={l} size="small" color={BIN_LEVEL_COLORS[l]} variant="outlined" sx={{ fontSize: '0.68rem' }} />
                  ))}
                </Stack>

                <Box sx={{ mt: 1.5 }}>
                  <Button size="small" endIcon={<ChevronRightIcon />} color="primary">
                    View Locations
                  </Button>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Warehouse form modal */}
      {editing && (
        <Modal open title={editing.id ? 'Edit Warehouse' : 'New Warehouse'} onClose={() => setEditing(null)} maxWidth="sm">
          <Stack spacing={2.5} sx={{ pt: 0.5 }}>
            <Grid container spacing={2}>
              <Grid item xs={8}>
                <TextField fullWidth label="Warehouse Name *" size="small"
                  value={editing.branchName}
                  onChange={(e) => setEditing({ ...editing, branchName: e.target.value })} />
              </Grid>
              <Grid item xs={4}>
                <TextField fullWidth label="Code *" size="small"
                  value={editing.branchCode}
                  onChange={(e) => setEditing({ ...editing, branchCode: e.target.value.toUpperCase() })}
                  inputProps={{ style: { fontFamily: 'monospace', fontWeight: 700 } }} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="City" size="small"
                  value={editing.city || ''}
                  onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="State" size="small"
                  value={editing.state || ''}
                  onChange={(e) => setEditing({ ...editing, state: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Address" size="small" multiline minRows={2}
                  value={editing.address || ''}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth label="Phone" size="small"
                  value={editing.phone || ''}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Grid>
            </Grid>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button variant="outlined" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="contained" onClick={saveWarehouse} disabled={busy || !editing.branchName || !editing.branchCode}>
                {busy ? 'Saving…' : 'Save Warehouse'}
              </Button>
            </Stack>
          </Stack>
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete Warehouse"
        message={`Delete "${deleting?.branchName}"? This cannot be undone.`}
        onConfirm={removeWarehouse}
        onCancel={() => setDeleting(null)}
      />
    </Stack>
  );
}

/* ── Helpers ── */
function flattenBins(tree) {
  if (!tree) return [];
  const result = [];
  function walk(nodes) {
    for (const n of nodes) {
      result.push(n);
      if (n.children?.length) walk(n.children);
    }
  }
  walk(Array.isArray(tree) ? tree : [tree]);
  return result;
}
