import DevicesIcon from '@mui/icons-material/Devices';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import SensorsIcon from '@mui/icons-material/Sensors';
import ContactlessIcon from '@mui/icons-material/Contactless';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  Alert, Box, Button, Chip, Grid, IconButton, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { devicesApi, warehousesApi } from '../../services/resource.service.js';
import { date } from '../../utils/formatters.js';

/**
 * The hardware register.
 *
 * The column that matters is the last one. A scanner that stopped reporting
 * looks exactly like a scanner with nothing to report, and the difference is
 * the whole reason this screen exists — so silence is shown as a state, with
 * how long it has lasted, rather than left for someone to infer from a
 * timestamp.
 */

const TYPE_META = {
  HANDHELD: { label: 'Handheld scanner', icon: <QrCodeScannerIcon fontSize="small" /> },
  RFID_READER: { label: 'RFID reader', icon: <ContactlessIcon fontSize="small" /> },
  SENSOR_GATEWAY: { label: 'Sensor gateway', icon: <SensorsIcon fontSize="small" /> },
  WCS_CONTROLLER: { label: 'Conveyor / WCS', icon: <PrecisionManufacturingIcon fontSize="small" /> },
};

const BLANK = {
  deviceCode: '', deviceName: '', deviceType: 'HANDHELD',
  binId: '', model: '', serialNumber: '', firmwareVersion: '', notes: '',
};

/** "3 minutes ago", because a raw timestamp makes the reader do the sum. */
function sinceLabel(value) {
  if (!value) return 'never';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export default function Devices() {
  const [rows, setRows] = useState([]);
  const [health, setHealth] = useState(null);
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([
        devicesApi.list(typeFilter ? { deviceType: typeFilter } : {}),
        devicesApi.health(),
      ]);
      setRows(list);
      setHealth(stats);
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load devices', 'error');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, showToast]);

  useEffect(() => { load(); }, [load]);

  // Bins are only needed for fixed hardware, and a site with no bin tree still
  // has scanners — so every failure here is swallowed and the picker simply
  // offers nothing rather than the screen refusing to load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await warehousesApi.list({ limit: 100 });
        const warehouses = Array.isArray(response) ? response : response?.data || [];
        // Bins hang off a warehouse, so the tree is gathered per warehouse and
        // flattened — the device form wants one flat list of places.
        const trees = await Promise.all(
          warehouses.map((w) => warehousesApi.bins(w.id).catch(() => [])),
        );
        if (!cancelled) setBins(trees.flat().filter((bin) => bin?.id));
      } catch {
        if (!cancelled) setBins([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    if (!form.deviceCode.trim() || !form.deviceName.trim()) {
      showToast('A device needs both a code and a name', 'error');
      return;
    }
    setSaving(true);
    try {
      await devicesApi.register({ ...form, binId: form.binId || null });
      showToast(`${form.deviceName} registered`);
      setOpen(false);
      setForm(BLANK);
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not register the device', 'error');
    } finally {
      setSaving(false);
    }
  };

  const retire = async (row) => {
    try {
      await devicesApi.retire(row.id);
      showToast(`${row.deviceName} retired`);
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not retire the device', 'error');
    }
  };

  if (loading && !rows.length) return <Loader />;

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Devices & Scanners"
        subtitle="Handhelds, sensor gateways and RFID readers that report on their own"
        icon={<DevicesIcon />}
        action={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => { setForm(BLANK); setOpen(true); }} sx={{ borderRadius: 2 }}>
              Register device
            </Button>
          </Stack>
        }
      />

      {health && (
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <StatsCard title="Registered" value={health.total} detail="Active devices" icon={<DevicesIcon />} gradient="primary" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <StatsCard title="Reporting" value={health.online} detail={`Seen in the last ${health.offlineAfterMinutes} min`} icon={<SensorsIcon />} gradient="success" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <StatsCard title="Gone quiet" value={health.offline} detail="Nothing heard" icon={<PrecisionManufacturingIcon />} gradient={health.offline ? 'warning' : 'success'} />
          </Grid>
        </Grid>
      )}

      {health?.silent?.length > 0 && (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          <Typography variant="body2" fontWeight={700} gutterBottom>
            {health.silent.length} device{health.silent.length > 1 ? 's have' : ' has'} stopped reporting
          </Typography>
          <Typography variant="caption">
            Longest silence first: {health.silent.slice(0, 4).map((d) => `${d.deviceName} (${sinceLabel(d.lastSeenAt)})`).join(', ')}
            {health.silent.length > 4 ? ` and ${health.silent.length - 4} more` : ''}
          </Typography>
        </Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            select size="small" label="Device type" value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)} sx={{ minWidth: 220 }}
          >
            <MenuItem value="">All types</MenuItem>
            {Object.entries(TYPE_META).map(([key, meta]) => (
              <MenuItem key={key} value={key}>{meta.label}</MenuItem>
            ))}
          </TextField>
        </Box>

        {!rows.length ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No devices registered yet. Register one with the code its firmware sends in <code>X-Device-Id</code>.
            </Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Device</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Firmware</TableCell>
                <TableCell>Last heard</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>{row.deviceName}</Typography>
                    <Typography variant="caption" color="text.secondary">{row.deviceCode}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      {TYPE_META[row.deviceType]?.icon}
                      <Typography variant="caption">{TYPE_META[row.deviceType]?.label || row.deviceType}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {row.branchName || '—'}{row.binCode ? ` · ${row.binCode}` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell><Typography variant="caption">{row.firmwareVersion || '—'}</Typography></TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.online ? 'Reporting' : sinceLabel(row.lastSeenAt)}
                      color={row.online ? 'success' : row.lastSeenAt ? 'warning' : 'default'}
                      variant={row.online ? 'filled' : 'outlined'}
                    />
                    {row.lastSeenAt && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {date(row.lastSeenAt)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Retire this device">
                      <IconButton size="small" onClick={() => retire(row)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Modal open={open} onClose={() => setOpen(false)} title="Register a device" maxWidth="sm">
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            The code must match what the hardware sends in its <code>X-Device-Id</code> header — that is how its
            scans and readings are attributed back to it.
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Device code" value={form.deviceCode}
                onChange={(e) => setForm({ ...form, deviceCode: e.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Name" value={form.deviceName}
                onChange={(e) => setForm({ ...form, deviceName: e.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Type" value={form.deviceType}
                onChange={(e) => setForm({ ...form, deviceType: e.target.value })}>
                {Object.entries(TYPE_META).map(([key, meta]) => (
                  <MenuItem key={key} value={key}>{meta.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Fixed to bin (optional)" value={form.binId}
                onChange={(e) => setForm({ ...form, binId: e.target.value })}
                helperText="Only for hardware bolted in place">
                <MenuItem value="">Not fixed</MenuItem>
                {bins.map((bin) => (
                  <MenuItem key={bin.id} value={bin.id}>{bin.code}{bin.name ? ` — ${bin.name}` : ''}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Model" value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Serial number" value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Notes" value={form.notes} multiline rows={2}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={submit} disabled={saving}>
              {saving ? 'Registering…' : 'Register'}
            </Button>
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
