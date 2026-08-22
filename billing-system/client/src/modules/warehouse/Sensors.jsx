import ThermostatIcon from '@mui/icons-material/Thermostat';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
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
import { useToast } from '../../context/ToastContext.jsx';
import { sensorsApi, warehousesApi } from '../../services/resource.service.js';

/**
 * Temperature and humidity, by place.
 *
 * Four states, not two. "In range" and "out of range" are the obvious pair, but
 * a probe that has stopped reporting is the failure most worth seeing and the
 * one a plain last-value display hides — a chiller showing 4°C from a sensor
 * that died on Friday looks perfectly healthy. So STALE and NO_DATA are shown
 * as loudly as a breach.
 */

const STATE_META = {
  OK: { label: 'In range', color: 'success' },
  BREACH: { label: 'Out of range', color: 'error' },
  STALE: { label: 'Not reporting', color: 'warning' },
  NO_DATA: { label: 'No readings yet', color: 'default' },
};

const BLANK = {
  binId: '', label: '', minTemperature: '', maxTemperature: '',
  minHumidity: '', maxHumidity: '', graceMinutes: 5,
};

const show = (value, suffix) => (value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`);

export default function Sensors() {
  const [tab, setTab] = useState(0);
  const [status, setStatus] = useState(null);
  const [thresholds, setThresholds] = useState([]);
  const [readings, setReadings] = useState([]);
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [breachedOnly, setBreachedOnly] = useState(false);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [board, limits, history] = await Promise.all([
        sensorsApi.status(),
        sensorsApi.thresholds(),
        sensorsApi.readings({ limit: 200, ...(breachedOnly ? { breachedOnly: true } : {}) }),
      ]);
      setStatus(board);
      setThresholds(limits);
      setReadings(history);
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load sensor data', 'error');
    } finally {
      setLoading(false);
    }
  }, [breachedOnly, showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await warehousesApi.list({ limit: 100 });
        const warehouses = Array.isArray(response) ? response : response?.data || [];
        const trees = await Promise.all(warehouses.map((w) => warehousesApi.bins(w.id).catch(() => [])));
        if (!cancelled) setBins(trees.flat().filter((bin) => bin?.id));
      } catch {
        if (!cancelled) setBins([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    const body = {
      ...form,
      binId: form.binId || null,
      // Empty means "no limit at this end", which is a real and common setting:
      // a freezer usually cares only that it never rises above a maximum.
      minTemperature: form.minTemperature === '' ? null : Number(form.minTemperature),
      maxTemperature: form.maxTemperature === '' ? null : Number(form.maxTemperature),
      minHumidity: form.minHumidity === '' ? null : Number(form.minHumidity),
      maxHumidity: form.maxHumidity === '' ? null : Number(form.maxHumidity),
      graceMinutes: Number(form.graceMinutes) || 0,
    };
    setSaving(true);
    try {
      if (editing) await sensorsApi.updateThreshold(editing.id, body);
      else await sensorsApi.saveThreshold(body);
      showToast(editing ? 'Threshold updated' : 'Threshold added');
      setOpen(false);
      setEditing(null);
      setForm(BLANK);
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not save the threshold', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    try {
      await sensorsApi.removeThreshold(row.id);
      showToast('Threshold removed');
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not remove it', 'error');
    }
  };

  const edit = (row) => {
    setEditing(row);
    setForm({
      binId: row.binId || '',
      label: row.label || '',
      minTemperature: row.minTemperature ?? '',
      maxTemperature: row.maxTemperature ?? '',
      minHumidity: row.minHumidity ?? '',
      maxHumidity: row.maxHumidity ?? '',
      graceMinutes: row.graceMinutes ?? 5,
    });
    setOpen(true);
  };

  if (loading && !status) return <Loader />;

  const summary = status?.summary || {};
  const attention = (summary.breach || 0) + (summary.stale || 0);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Temperature & Humidity"
        subtitle="Cold chain and curing rooms, and whether they are still being watched"
        icon={<ThermostatIcon />}
        action={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
            <Button startIcon={<AddIcon />} variant="contained" sx={{ borderRadius: 2 }}
              onClick={() => { setEditing(null); setForm(BLANK); setOpen(true); }}>
              Add threshold
            </Button>
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}>
          <StatsCard title="Monitored" value={summary.monitored || 0} detail="Places with limits" icon={<ThermostatIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatsCard title="In range" value={summary.ok || 0} detail="Behaving" icon={<WaterDropIcon />} gradient="success" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatsCard title="Out of range" value={summary.breach || 0} detail="Excursion open" icon={<WarningAmberIcon />} gradient={summary.breach ? 'error' : 'success'} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatsCard title="Not reporting" value={(summary.stale || 0) + (summary.noData || 0)} detail="Probe silent" icon={<HelpOutlineIcon />} gradient={summary.stale ? 'warning' : 'success'} />
        </Grid>
      </Grid>

      {attention > 0 && (
        <Alert severity={summary.breach ? 'error' : 'warning'} sx={{ borderRadius: 2 }}>
          {summary.breach > 0 && `${summary.breach} place(s) are outside their safe range. `}
          {summary.stale > 0 && `${summary.stale} sensor(s) have stopped reporting — a place nobody is watching reads as fine.`}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab label="Live board" />
          <Tab label={`Thresholds (${thresholds.length})`} />
          <Tab label="Readings" />
        </Tabs>

        {tab === 0 && (
          !status?.places?.length ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                Nothing is being monitored yet. Add a threshold for a bin, then point a gateway at it.
              </Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Place</TableCell>
                  <TableCell>Safe range</TableCell>
                  <TableCell align="right">Temperature</TableCell>
                  <TableCell align="right">Humidity</TableCell>
                  <TableCell>Last reading</TableCell>
                  <TableCell>State</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {status.places.map((place) => (
                  <TableRow key={place.thresholdId} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {place.binCode || place.label || 'Site default'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{place.binName || place.label || ''}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {show(place.limits.minTemperature, '°')}–{show(place.limits.maxTemperature, '°C')}
                        {(place.limits.minHumidity !== null || place.limits.maxHumidity !== null) &&
                          ` · ${show(place.limits.minHumidity, '')}–${show(place.limits.maxHumidity, '%')}`}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700}
                        color={place.state === 'BREACH' ? 'error.main' : 'text.primary'}>
                        {place.latest?.temperature ?? '—'}{place.latest?.temperature != null ? `°${place.latest.temperatureUnit}` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{place.latest?.humidity ?? '—'}{place.latest?.humidity != null ? '%' : ''}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {place.ageMinutes === null ? 'never' : place.ageMinutes < 60 ? `${place.ageMinutes} min ago` : `${Math.round(place.ageMinutes / 60)} hr ago`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={STATE_META[place.state]?.label || place.state}
                        color={STATE_META[place.state]?.color || 'default'} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        )}

        {tab === 1 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Applies to</TableCell>
                <TableCell>Temperature</TableCell>
                <TableCell>Humidity</TableCell>
                <TableCell align="right">Grace</TableCell>
                <TableCell>Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!thresholds.length && (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                  <Typography color="text.secondary" variant="body2">No thresholds defined.</Typography>
                </TableCell></TableRow>
              )}
              {thresholds.map((row) => (
                <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => edit(row)}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>{row.binCode || 'Site default'}</Typography>
                    <Typography variant="caption" color="text.secondary">{row.label || row.binName || 'Applies to any bin without its own'}</Typography>
                  </TableCell>
                  <TableCell><Typography variant="caption">{show(row.minTemperature, '°C')} – {show(row.maxTemperature, '°C')}</Typography></TableCell>
                  <TableCell><Typography variant="caption">{show(row.minHumidity, '%')} – {show(row.maxHumidity, '%')}</Typography></TableCell>
                  <TableCell align="right"><Typography variant="caption">{row.graceMinutes} min</Typography></TableCell>
                  <TableCell><Chip size="small" label={row.isActive ? 'Active' : 'Stood down'} color={row.isActive ? 'success' : 'default'} /></TableCell>
                  <TableCell align="right">
                    <Tooltip title="Remove">
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); remove(row); }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {tab === 2 && (
          <>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Button size="small" variant={breachedOnly ? 'contained' : 'outlined'}
                onClick={() => setBreachedOnly((v) => !v)} sx={{ borderRadius: 2 }}>
                {breachedOnly ? 'Showing breaches only' : 'Show breaches only'}
              </Button>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Recorded</TableCell>
                  <TableCell>Place</TableCell>
                  <TableCell>Gateway</TableCell>
                  <TableCell align="right">Temp</TableCell>
                  <TableCell align="right">Humidity</TableCell>
                  <TableCell>Verdict</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!readings.length && (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Typography color="text.secondary" variant="body2">No readings recorded.</Typography>
                  </TableCell></TableRow>
                )}
                {readings.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell><Typography variant="caption">{new Date(row.recordedAt).toLocaleString()}</Typography></TableCell>
                    <TableCell><Typography variant="caption">{row.binCode || '—'}</Typography></TableCell>
                    <TableCell><Typography variant="caption">{row.deviceCode || 'manual'}</Typography></TableCell>
                    <TableCell align="right">{row.temperature ?? '—'}{row.temperature != null ? `°${row.temperatureUnit}` : ''}</TableCell>
                    <TableCell align="right">{row.humidity ?? '—'}{row.humidity != null ? '%' : ''}</TableCell>
                    <TableCell>
                      <Chip size="small" label={row.breached ? 'Out of range' : 'In range'}
                        color={row.breached ? 'error' : 'success'} variant={row.breached ? 'filled' : 'outlined'} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Paper>

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); }}
        title={editing ? 'Edit threshold' : 'Add a threshold'} maxWidth="sm">
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Leave a bound empty for "no limit at that end". The grace period is how long a place may stay
            outside its range before an exception is raised — without one, a door held open during a load
            would alert every time.
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={7}>
              <TextField fullWidth select label="Applies to" value={form.binId}
                onChange={(e) => setForm({ ...form, binId: e.target.value })}>
                <MenuItem value="">Site default (any bin without its own)</MenuItem>
                {bins.map((bin) => (
                  <MenuItem key={bin.id} value={bin.id}>{bin.code}{bin.name ? ` — ${bin.name}` : ''}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField fullWidth label="Label" value={form.label} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Chiller 1" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth type="number" label="Min °C" value={form.minTemperature} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, minTemperature: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth type="number" label="Max °C" value={form.maxTemperature} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, maxTemperature: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth type="number" label="Min %RH" value={form.minHumidity} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, minHumidity: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth type="number" label="Max %RH" value={form.maxHumidity} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, maxHumidity: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="number" label="Grace (minutes)" value={form.graceMinutes} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })}
                helperText="How long out of range before it counts" />
            </Grid>
          </Grid>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
            <Button variant="contained" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Add'}
            </Button>
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
