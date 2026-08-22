import ContactlessIcon from '@mui/icons-material/Contactless';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  Alert, Box, Button, Chip, Grid, IconButton, MenuItem, Paper, Stack, Tab, Tabs,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import SearchBox from '../../components/SearchBox.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { productsApi, rfidApi, warehousesApi } from '../../services/resource.service.js';

/**
 * RFID tags, and sweeping a bin to see what is really in it.
 *
 * The reconcile panel deliberately reports rather than corrects. A sweep is
 * evidence — readers pick tags up through racking and off passing forklifts —
 * so a disagreement is something for a person to settle on the counting screen,
 * not a stock movement this page performs quietly. The button says "Reconcile",
 * and what comes back is a list of findings.
 */

const STATUS_COLORS = { ASSIGNED: 'success', UNASSIGNED: 'default', SHIPPED: 'info', RETIRED: 'warning' };

export default function RfidTags() {
  const [tab, setTab] = useState(0);
  const [tags, setTags] = useState([]);
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ epc: '', productId: '', quantity: 1 });
  const [saving, setSaving] = useState(false);

  // Reconciliation
  const [sweepBin, setSweepBin] = useState('');
  const [sweepText, setSweepText] = useState('');
  const [raise, setRaise] = useState(false);
  const [findings, setFindings] = useState(null);
  const [sweeping, setSweeping] = useState(false);

  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([
        rfidApi.tags(search ? { search, limit: 300 } : { limit: 300 }),
        rfidApi.summary(),
      ]);
      setTags(list);
      setSummary(stats);
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load tags', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await productsApi.list({ limit: 500 });
        if (!cancelled) setProducts(response?.data || []);
      } catch { if (!cancelled) setProducts([]); }
      try {
        const response = await warehousesApi.list({ limit: 100 });
        const warehouses = Array.isArray(response) ? response : response?.data || [];
        const trees = await Promise.all(warehouses.map((w) => warehousesApi.bins(w.id).catch(() => [])));
        if (!cancelled) setBins(trees.flat().filter((bin) => bin?.id));
      } catch { if (!cancelled) setBins([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    if (!form.epc.trim()) { showToast('A tag needs its EPC', 'error'); return; }
    setSaving(true);
    try {
      await rfidApi.registerTag({ ...form, productId: form.productId || null, quantity: Number(form.quantity) || 1 });
      showToast('Tag registered');
      setOpen(false);
      setForm({ epc: '', productId: '', quantity: 1 });
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not register the tag', 'error');
    } finally {
      setSaving(false);
    }
  };

  const retire = async (row) => {
    try {
      await rfidApi.retireTag(row.id);
      showToast('Tag retired');
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not retire it', 'error');
    }
  };

  const reconcile = async () => {
    // One EPC per line, or comma-separated — whichever way the reader exports.
    const epcs = sweepText.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!sweepBin) { showToast('Choose the bin that was swept', 'error'); return; }
    if (!epcs.length) { showToast('Paste the EPCs the reader saw', 'error'); return; }

    setSweeping(true);
    try {
      const result = await rfidApi.reconcile({ binId: sweepBin, epcs, raiseExceptions: raise });
      setFindings(result);
      showToast(`Swept ${epcs.length} tag(s)`);
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not reconcile', 'error');
    } finally {
      setSweeping(false);
    }
  };

  if (loading && !tags.length && !summary) return <Loader />;

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="RFID Tags"
        subtitle="What is tagged, where it was last seen, and what a sweep actually found"
        icon={<ContactlessIcon />}
        action={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)} sx={{ borderRadius: 2 }}>
              Register tag
            </Button>
          </Stack>
        }
      />

      {summary && (
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <StatsCard title="Tags" value={summary.total} detail="On the register" icon={<ContactlessIcon />} gradient="primary" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatsCard title="Assigned" value={summary.byStatus?.ASSIGNED || 0} detail="Attached to stock" icon={<FactCheckIcon />} gradient="success" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatsCard title="Seen today" value={summary.seenToday} detail="Read in 24 hours" icon={<RefreshIcon />} gradient="info" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatsCard title="Never seen" value={summary.neverSeen} detail="Applied but never swept" icon={<ContactlessIcon />} gradient={summary.neverSeen ? 'warning' : 'success'} />
          </Grid>
        </Grid>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab label={`Tags (${tags.length})`} />
          <Tab label="Reconcile a bin" />
        </Tabs>

        {tab === 0 && (
          <>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <SearchBox value={search} onChange={setSearch} placeholder="Search by EPC…" />
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>EPC</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Represents</TableCell>
                  <TableCell>Last seen</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!tags.length && (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Typography color="text.secondary" variant="body2">No tags registered.</Typography>
                  </TableCell></TableRow>
                )}
                {tags.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell><Typography variant="caption" fontFamily="monospace">{row.epc}</Typography></TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.productName || <em>unassigned</em>}</Typography>
                      {row.batchNumber && <Typography variant="caption" color="text.secondary">Lot {row.batchNumber}</Typography>}
                    </TableCell>
                    <TableCell align="right"><Typography variant="caption">{row.quantity}</Typography></TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {row.lastSeenBinCode || '—'}
                        {row.lastSeenAt && <> · {new Date(row.lastSeenAt).toLocaleString()}</>}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={row.status} color={STATUS_COLORS[row.status] || 'default'} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Retire this tag">
                        <IconButton size="small" onClick={() => retire(row)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            <Alert severity="info" sx={{ borderRadius: 2, mb: 2 }}>
              A sweep is evidence, not a stock movement. Nothing here changes a balance — what comes back is a
              list of disagreements to settle on the counting screen.
            </Alert>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={5}>
                <TextField fullWidth select label="Bin that was swept" value={sweepBin}
                  onChange={(e) => setSweepBin(e.target.value)}>
                  <MenuItem value="">Choose a bin</MenuItem>
                  {bins.map((bin) => (
                    <MenuItem key={bin.id} value={bin.id}>{bin.code}{bin.name ? ` — ${bin.name}` : ''}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={7}>
                <Button variant={raise ? 'contained' : 'outlined'} onClick={() => setRaise((v) => !v)} sx={{ borderRadius: 2, mt: 1 }}>
                  {raise ? 'Will raise an exception' : 'Raise an exception for differences'}
                </Button>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  Leave off for a first sweep of an untagged bay, or it will raise hundreds at once.
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth multiline rows={6} label="EPCs the reader saw" value={sweepText}
                  onChange={(e) => setSweepText(e.target.value)} InputLabelProps={{ shrink: true }}
                  placeholder={'E280-AAA\nE280-BBB\nE280-CCC'}
                  helperText="One per line, or comma separated" />
              </Grid>
              <Grid item xs={12}>
                <Button variant="contained" startIcon={<FactCheckIcon />} onClick={reconcile} disabled={sweeping} sx={{ borderRadius: 2 }}>
                  {sweeping ? 'Reconciling…' : 'Reconcile'}
                </Button>
              </Grid>
            </Grid>

            {findings && (
              <Stack spacing={2} sx={{ mt: 3 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Saw {findings.seen} tag(s)
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary">Expected here, not found</Typography>
                      <Typography variant="h5" fontWeight={800} color={findings.missing?.length ? 'warning.main' : 'success.main'}>
                        {findings.missing?.length || 0}
                      </Typography>
                      {findings.missing?.slice(0, 5).map((row) => (
                        <Typography key={row.epc} variant="caption" display="block" fontFamily="monospace">
                          {row.epc} {row.productName ? `· ${row.productName}` : ''}
                        </Typography>
                      ))}
                    </Paper>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary">Found, register said elsewhere</Typography>
                      <Typography variant="h5" fontWeight={800} color={findings.unexpected?.length ? 'error.main' : 'success.main'}>
                        {findings.unexpected?.length || 0}
                      </Typography>
                      {findings.unexpected?.slice(0, 5).map((row) => (
                        <Typography key={row.epc} variant="caption" display="block" fontFamily="monospace">{row.epc}</Typography>
                      ))}
                    </Paper>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary">Not on the register at all</Typography>
                      <Typography variant="h5" fontWeight={800}>{findings.unknown?.length || 0}</Typography>
                      {findings.unknown?.slice(0, 5).map((epc) => (
                        <Typography key={epc} variant="caption" display="block" fontFamily="monospace">{epc}</Typography>
                      ))}
                    </Paper>
                  </Grid>
                </Grid>
                {findings.exception && (
                  <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    Exception #{findings.exception.id} raised for a person to settle.
                  </Alert>
                )}
              </Stack>
            )}
          </Box>
        )}
      </Paper>

      <Modal open={open} onClose={() => setOpen(false)} title="Register a tag" maxWidth="sm">
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField fullWidth required label="EPC" value={form.epc} InputLabelProps={{ shrink: true }}
            onChange={(e) => setForm({ ...form, epc: e.target.value })} />
          <TextField fullWidth select label="Product" value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
            helperText="Leave empty for a pre-encoded tag not yet applied">
            <MenuItem value="">Unassigned</MenuItem>
            {products.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.productName}</MenuItem>
            ))}
          </TextField>
          <TextField fullWidth type="number" label="Units this tag represents" value={form.quantity}
            InputLabelProps={{ shrink: true }} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            helperText="A tag on a pallet of 48 is not a tag on one sack" />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Register'}</Button>
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
