import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeWorkIcon from '@mui/icons-material/HomeWork';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert, Box, Button, Chip, Grid, IconButton, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import SearchBox from '../../components/SearchBox.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { stockOwnersApi } from '../../services/resource.service.js';
import { currency } from '../../utils/formatters.js';

/**
 * Whose goods are on our shelves.
 *
 * The house owner is the company itself and is shown first, marked, and cannot
 * be deleted — every stock row in the system points at some owner, and the
 * house is what "ours" means. Third-party owners carry storage and handling
 * rates because that is what the warehouse bills them for.
 *
 * Client stock is valued at cost for the client's own information and is
 * deliberately never added to the company's valuation. These are not our goods,
 * and a total that quietly included them would overstate what the business owns.
 */

const BLANK = {
  ownerName: '', ownerCode: '', contactPerson: '', mobileNumber: '', email: '',
  gstNumber: '', address: '',
  storageRatePerUnitPerDay: 0, handlingRateInbound: 0, handlingRateOutbound: 0,
  freeStorageDays: 0, notes: '',
};

export default function StockOwners() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [holdings, setHoldings] = useState(null);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await stockOwnersApi.list(search ? { search } : {});
      setRows(Array.isArray(response) ? response : response?.data || []);
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load stock owners', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, showToast]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.ownerName.trim() || !form.ownerCode.trim()) {
      showToast('An owner needs a name and a short code', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        storageRatePerUnitPerDay: Number(form.storageRatePerUnitPerDay) || 0,
        handlingRateInbound: Number(form.handlingRateInbound) || 0,
        handlingRateOutbound: Number(form.handlingRateOutbound) || 0,
        freeStorageDays: Number(form.freeStorageDays) || 0,
      };
      if (editing) await stockOwnersApi.update(editing.id, body);
      else await stockOwnersApi.create(body);
      showToast(editing ? 'Owner updated' : `${form.ownerName} added`);
      setOpen(false);
      setEditing(null);
      setForm(BLANK);
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not save the owner', 'error');
    } finally {
      setSaving(false);
    }
  };

  const edit = (row) => {
    setEditing(row);
    setForm({
      ownerName: row.ownerName || '',
      ownerCode: row.ownerCode || '',
      contactPerson: row.contactPerson || '',
      mobileNumber: row.mobileNumber || '',
      email: row.email || '',
      gstNumber: row.gstNumber || '',
      address: row.address || '',
      storageRatePerUnitPerDay: row.storageRatePerUnitPerDay ?? 0,
      handlingRateInbound: row.handlingRateInbound ?? 0,
      handlingRateOutbound: row.handlingRateOutbound ?? 0,
      freeStorageDays: row.freeStorageDays ?? 0,
      notes: row.notes || '',
    });
    setOpen(true);
  };

  const remove = async (row) => {
    try {
      await stockOwnersApi.remove(row.id);
      showToast(`${row.ownerName} removed`);
      load();
    } catch (error) {
      // The server refuses while an owner still holds stock — surfaced as-is,
      // because "it still has 400 units on your shelves" is the useful answer.
      showToast(error.response?.data?.message || 'Could not remove the owner', 'error');
    }
  };

  const viewHoldings = async (row) => {
    try {
      setHoldings(await stockOwnersApi.holdings(row.id));
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load holdings', 'error');
    }
  };

  if (loading && !rows.length) return <Loader />;

  const thirdParty = rows.filter((row) => !row.isHouse);
  // House first, then everyone else — "ours" is the row people look for.
  const ordered = [...rows].sort((a, b) => Number(b.isHouse) - Number(a.isHouse));

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Stock Owners"
        subtitle="Whose goods are on the shelves, and what they are charged to keep them there"
        icon={<BusinessCenterIcon />}
        action={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
            <Button startIcon={<AddIcon />} variant="contained" sx={{ borderRadius: 2 }}
              onClick={() => { setEditing(null); setForm(BLANK); setOpen(true); }}>
              Add owner
            </Button>
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Owners" value={rows.length} detail="Including the house" icon={<BusinessCenterIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Third-party clients" value={thirdParty.length} detail="Storing goods with us" icon={<Inventory2Icon />} gradient="info" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Chargeable" value={thirdParty.filter((r) => Number(r.storageRatePerUnitPerDay) > 0).length}
            detail="With a storage rate set" icon={<HomeWorkIcon />} gradient="success" />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search owners…" />
        </Box>

        {!ordered.length ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No stock owners yet. The house owner is created automatically the first time stock moves.
            </Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Owner</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell align="right">Storage / unit / day</TableCell>
                <TableCell align="right">Handling in / out</TableCell>
                <TableCell align="right">Free days</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ordered.map((row) => (
                <TableRow key={row.id} hover sx={{ cursor: row.isHouse ? 'default' : 'pointer' }}
                  onClick={() => !row.isHouse && edit(row)}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" fontWeight={700}>{row.ownerName}</Typography>
                      {row.isHouse && <Chip size="small" label="Our own stock" color="primary" />}
                      {!row.isActive && <Chip size="small" label="Inactive" />}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{row.ownerCode}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" display="block">{row.contactPerson || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">{row.mobileNumber || ''}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    {row.isHouse ? <Typography variant="caption" color="text.secondary">n/a</Typography>
                      : currency(row.storageRatePerUnitPerDay)}
                  </TableCell>
                  <TableCell align="right">
                    {row.isHouse ? <Typography variant="caption" color="text.secondary">n/a</Typography>
                      : `${currency(row.handlingRateInbound)} / ${currency(row.handlingRateOutbound)}`}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption">{row.isHouse ? '—' : row.freeStorageDays}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="What they are holding">
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); viewHoldings(row); }}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {/* The house owner is what "ours" means — every stock row
                        points at it, so it is never deletable. */}
                    {!row.isHouse && (
                      <Tooltip title="Remove this owner">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); remove(row); }}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); }}
        title={editing ? `Edit ${editing.ownerName}` : 'Add a stock owner'} maxWidth="sm">
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            A third-party owner is a business whose goods you store. Their stock is kept on a separate balance
            and is never counted in your own valuation.
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField fullWidth required label="Owner name" value={form.ownerName} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth required label="Short code" value={form.ownerCode} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, ownerCode: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Contact person" value={form.contactPerson} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Mobile" value={form.mobileNumber} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Email" value={form.email} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="GST number" value={form.gstNumber} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Address" value={form.address} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" fontWeight={700}>What they are charged</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth type="number" label="Storage / unit / day" value={form.storageRatePerUnitPerDay}
                InputLabelProps={{ shrink: true }} inputProps={{ min: 0, step: 'any' }}
                onChange={(e) => setForm({ ...form, storageRatePerUnitPerDay: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth type="number" label="Handling in" value={form.handlingRateInbound}
                InputLabelProps={{ shrink: true }} inputProps={{ min: 0, step: 'any' }}
                onChange={(e) => setForm({ ...form, handlingRateInbound: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth type="number" label="Handling out" value={form.handlingRateOutbound}
                InputLabelProps={{ shrink: true }} inputProps={{ min: 0, step: 'any' }}
                onChange={(e) => setForm({ ...form, handlingRateOutbound: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth type="number" label="Free days" value={form.freeStorageDays}
                InputLabelProps={{ shrink: true }} inputProps={{ min: 0 }}
                onChange={(e) => setForm({ ...form, freeStorageDays: e.target.value })}
                helperText="Before storage is billed" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Notes" value={form.notes} multiline rows={2} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Grid>
          </Grid>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
            <Button variant="contained" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Add owner'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <Modal open={Boolean(holdings)} onClose={() => setHoldings(null)}
        title={holdings ? `${holdings.owner?.ownerName} — holdings` : 'Holdings'} maxWidth="md">
        {holdings && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">Units held</Typography>
                  <Typography variant="h6" fontWeight={800}>{holdings.totalUnitsHeld}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={4}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">Handled in</Typography>
                  <Typography variant="h6" fontWeight={800}>{holdings.handledIn}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={4}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">Handled out</Typography>
                  <Typography variant="h6" fontWeight={800}>{holdings.handledOut}</Typography>
                </Paper>
              </Grid>
            </Grid>

            {!holdings.lines?.length ? (
              <Typography color="text.secondary" variant="body2" sx={{ py: 2, textAlign: 'center' }}>
                Nothing currently on the shelves for this owner.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell>SKU</TableCell>
                    <TableCell align="right">Quantity</TableCell>
                    <TableCell align="right">Value at cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {holdings.lines.map((line) => (
                    <TableRow key={`${line.productId}-${line.branchId}`}>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell><Typography variant="caption">{line.sku || '—'}</Typography></TableCell>
                      <TableCell align="right">{line.quantity} {line.unit || ''}</TableCell>
                      <TableCell align="right">{currency(line.valueAtCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {!holdings.owner?.isHouse && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Valued at cost for this client&apos;s information only. Third-party stock is never included in
                your own inventory valuation — these are not your goods.
              </Alert>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
