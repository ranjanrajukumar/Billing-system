import WebhookIcon from '@mui/icons-material/Webhook';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import KeyIcon from '@mui/icons-material/Key';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert, Box, Button, Checkbox, Chip, FormControlLabel, Grid, IconButton, MenuItem,
  Paper, Stack, Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { webhooksApi } from '../../services/resource.service.js';

/**
 * Outbound integrations.
 *
 * The secret is shown exactly once, when the endpoint is created or the key is
 * rotated, and there is no way to read it back afterwards — the server does not
 * return it. So the dialog that shows it says so plainly and refuses to be
 * dismissed by accident: a secret lost at this moment means rotating and
 * reconfiguring the far end.
 */

const STATUS_COLORS = { DELIVERED: 'success', PENDING: 'info', FAILED: 'warning', ABANDONED: 'error' };

export default function Webhooks() {
  const [tab, setTab] = useState(0);
  const [endpoints, setEndpoints] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: '', url: '', events: [] });
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, log, vocab] = await Promise.all([
        webhooksApi.list(),
        webhooksApi.deliveries(statusFilter ? { status: statusFilter, limit: 200 } : { limit: 200 }),
        webhooksApi.vocabulary(),
      ]);
      setEndpoints(list);
      setDeliveries(log);
      setEvents(vocab.events || []);
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load webhooks', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, showToast]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.label.trim() || !form.url.trim()) {
      showToast('An endpoint needs a label and a URL', 'error');
      return;
    }
    setSaving(true);
    try {
      const created = await webhooksApi.create(form);
      setOpen(false);
      setForm({ label: '', url: '', events: [] });
      // Shown once and never again — the API does not return it on a read.
      setSecret({ label: created.label, value: created.secret });
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not create the endpoint', 'error');
    } finally {
      setSaving(false);
    }
  };

  const rotate = async (row) => {
    try {
      const result = await webhooksApi.rotate(row.id);
      setSecret({ label: row.label, value: result.secret, rotated: true });
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not rotate the secret', 'error');
    }
  };

  const test = async (row) => {
    try {
      const result = await webhooksApi.test(row.id);
      showToast(
        result.ok ? `${row.label} accepted the test call` : `${row.label} rejected it: ${result.delivery?.lastError || 'no reason given'}`,
        result.ok ? 'success' : 'error',
      );
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not send the test', 'error');
    }
  };

  const remove = async (row) => {
    try {
      await webhooksApi.remove(row.id);
      showToast(`${row.label} removed`);
      load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not remove it', 'error');
    }
  };

  const toggleEvent = (event) => setForm((f) => ({
    ...f,
    events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event],
  }));

  const copy = (value) => {
    navigator.clipboard?.writeText(value)
      .then(() => showToast('Copied'))
      .catch(() => showToast('Could not copy — select and copy it by hand', 'error'));
  };

  if (loading && !endpoints.length) return <Loader />;

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="API & Webhooks"
        subtitle="Tell another system when something happens here"
        icon={<WebhookIcon />}
        action={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)} sx={{ borderRadius: 2 }}>
              Add endpoint
            </Button>
          </Stack>
        }
      />

      <Alert severity="warning" sx={{ borderRadius: 2 }}>
        An endpoint forwards this company&apos;s trading activity to an address you type. Add one only for a system
        you control or trust — every subscribed event is sent there as it happens.
      </Alert>

      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab label={`Endpoints (${endpoints.length})`} />
          <Tab label="Delivery log" />
        </Tabs>

        {tab === 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Endpoint</TableCell>
                <TableCell>Events</TableCell>
                <TableCell>Health</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!endpoints.length && (
                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary" variant="body2">
                    No endpoints yet. Add one to start sending events.
                  </Typography>
                </TableCell></TableRow>
              )}
              {endpoints.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>{row.label}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>{row.url}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {row.events?.length
                        ? row.events.map((event) => <Chip key={event} size="small" label={event} variant="outlined" />)
                        : <Typography variant="caption" color="text.secondary">nothing subscribed</Typography>}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip size="small"
                      label={!row.isActive ? 'Switched off' : row.consecutiveFailures ? `${row.consecutiveFailures} failing` : 'Healthy'}
                      color={!row.isActive ? 'default' : row.consecutiveFailures ? 'warning' : 'success'} />
                    {row.lastFailureReason && (
                      <Typography variant="caption" color="error.main" display="block">{row.lastFailureReason}</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Send a test call"><IconButton size="small" onClick={() => test(row)}><SendIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Rotate the signing secret"><IconButton size="small" onClick={() => rotate(row)}><KeyIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Remove"><IconButton size="small" onClick={() => remove(row)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {tab === 1 && (
          <>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <TextField select size="small" label="Status" value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="">All</MenuItem>
                {['PENDING', 'DELIVERED', 'FAILED', 'ABANDONED'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Event</TableCell>
                  <TableCell>Endpoint</TableCell>
                  <TableCell align="right">Attempts</TableCell>
                  <TableCell>Response</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!deliveries.length && (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <Typography color="text.secondary" variant="body2">Nothing sent yet.</Typography>
                  </TableCell></TableRow>
                )}
                {deliveries.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography variant="body2">{row.eventType}</Typography>
                      <Typography variant="caption" color="text.secondary" fontFamily="monospace">{row.eventId?.slice(0, 8)}</Typography>
                    </TableCell>
                    <TableCell><Typography variant="caption">{row.endpointLabel || '—'}</Typography></TableCell>
                    <TableCell align="right">{row.attempts}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color={row.lastError ? 'error.main' : 'text.secondary'}>
                        {row.responseStatus ? `HTTP ${row.responseStatus}` : row.lastError || '—'}
                      </Typography>
                      {row.nextAttemptAt && row.status === 'FAILED' && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          retry {new Date(row.nextAttemptAt).toLocaleTimeString()}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell><Chip size="small" label={row.status} color={STATUS_COLORS[row.status] || 'default'} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Paper>

      <Modal open={open} onClose={() => setOpen(false)} title="Add an endpoint" maxWidth="sm">
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField fullWidth required label="Label" value={form.label} InputLabelProps={{ shrink: true }}
            onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Partner ERP" />
          <TextField fullWidth required label="URL" value={form.url} InputLabelProps={{ shrink: true }}
            onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/hooks/billing" />
          <Box>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Events to send</Typography>
            <Grid container>
              {events.map((event) => (
                <Grid item xs={12} sm={6} key={event}>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={form.events.includes(event)} onChange={() => toggleEvent(event)} />}
                    label={<Typography variant="body2">{event}</Typography>}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button>
          </Stack>
        </Stack>
      </Modal>

      <Modal open={Boolean(secret)} onClose={() => setSecret(null)}
        title={secret?.rotated ? 'New signing secret' : 'Signing secret'} maxWidth="sm">
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            Copy this now. It is shown once and cannot be read back — if you lose it you will have to rotate
            the key and reconfigure the far end.
            {secret?.rotated && ' The previous secret stopped working the moment this one was issued.'}
          </Alert>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" fontFamily="monospace" sx={{ wordBreak: 'break-all', flex: 1 }}>
              {secret?.value}
            </Typography>
            <IconButton size="small" onClick={() => copy(secret.value)}><ContentCopyIcon fontSize="small" /></IconButton>
          </Paper>
          <Typography variant="caption" color="text.secondary">
            Each call carries <code>X-Webhook-Signature: t=&lt;timestamp&gt;,v1=&lt;hmac&gt;</code>, where the HMAC is
            SHA-256 over <code>timestamp + &quot;.&quot; + body</code> using this secret. Verify it before trusting a call,
            and reject anything with an old timestamp.
          </Typography>
          <Stack direction="row" justifyContent="flex-end">
            <Button variant="contained" onClick={() => setSecret(null)}>I have copied it</Button>
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
