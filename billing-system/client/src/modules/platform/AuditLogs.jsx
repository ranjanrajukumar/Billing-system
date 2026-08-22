import HistoryIcon from '@mui/icons-material/History';
import {
  alpha, Box, Chip, Grid, MenuItem, Paper, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import SearchBox from '../../components/SearchBox.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import api from '../../services/api.js';
import { date } from '../../utils/formatters.js';

const ACTION_COLORS = {
  Create: 'success',
  Update: 'info',
  Delete: 'error',
  Login: 'primary',
  LoginFailed: 'warning',
  PasswordReset: 'secondary',
};

const when = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return `${date(d)} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const isoDay = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
};

/**
 * The log grows without limit, so it opens on the last month rather than the
 * whole history. Every preset stays one click away, including All time.
 */
const RANGE_PRESETS = [
  { key: 'month', label: 'Last month', range: () => ({ from: daysAgo(30), to: isoDay(new Date()) }) },
  { key: 'quarter', label: 'Last 3 months', range: () => ({ from: daysAgo(90), to: isoDay(new Date()) }) },
  { key: 'year', label: 'Last year', range: () => ({ from: daysAgo(365), to: isoDay(new Date()) }) },
  { key: 'all', label: 'All time', range: () => ({ from: '', to: '' }) },
];

const DEFAULT_RANGE = RANGE_PRESETS[0].range();

export default function AuditLogs() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [filters, setFilters] = useState({ actions: [], entities: [], users: [] });
  const [query, setQuery] = useState({
    page: 1, limit: 25, search: '', action: '', entity: '', userId: '',
    ...DEFAULT_RANGE,
  });
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v != null));
      const result = await api.get('/audit-logs', { params }).then((r) => r.data);
      setRows(result?.data || []);
      setMeta(result?.meta || {});
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load audit logs', 'error');
      setRows([]); setMeta({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  useEffect(() => {
    api.get('/audit-logs/filters')
      .then((r) => setFilters(r.data))
      .catch(() => setFilters({ actions: [], entities: [], users: [] }));
  }, []);

  const set = (patch) => setQuery((prev) => ({ ...prev, ...patch, page: 1 }));

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Audit Logs"
        subtitle="Who changed what, when — every create, update, delete and sign-in"
        icon={<HistoryIcon />}
        action={<SearchBox value={query.search} onChange={(search) => set({ search })} placeholder="Search summary…" />}
      />

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={6} sm={3}>
            <TextField
              select fullWidth size="small" label="Action" value={query.action}
              onChange={(e) => set({ action: e.target.value })} InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">All actions</MenuItem>
              {(filters.actions || []).map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              select fullWidth size="small" label="Record type" value={query.entity}
              onChange={(e) => set({ entity: e.target.value })} InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">All types</MenuItem>
              {(filters.entities || []).map((e) => <MenuItem key={e} value={e}>{e}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              select fullWidth size="small" label="User" value={query.userId}
              onChange={(e) => set({ userId: e.target.value })} InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">Everyone</MenuItem>
              {(filters.users || []).map((u) => (
                <MenuItem key={u.userId} value={String(u.userId)}>{u.userName || `User ${u.userId}`}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={1.5}>
            <TextField
              fullWidth size="small" type="date" label="From" value={query.from}
              onChange={(e) => set({ from: e.target.value })} InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={1.5}>
            <TextField
              fullWidth size="small" type="date" label="To" value={query.to}
              onChange={(e) => set({ to: e.target.value })} InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>Period</Typography>
          {RANGE_PRESETS.map((preset) => {
            const range = preset.range();
            const active = query.from === range.from && query.to === range.to;
            return (
              <Chip
                key={preset.key}
                size="small"
                label={preset.label}
                color={active ? 'primary' : 'default'}
                variant={active ? 'filled' : 'outlined'}
                onClick={() => set(range)}
                sx={{ fontWeight: 700, fontSize: '0.72rem' }}
              />
            );
          })}
          <Typography variant="caption" color="text.secondary">
            {query.from || query.to
              ? `Showing ${query.from ? date(query.from) : 'the beginning'} to ${query.to ? date(query.to) : 'now'}`
              : 'Showing the entire history'}
          </Typography>
        </Stack>
      </Paper>

      {loading ? <Loader /> : (
        <>
          <DataTable
            mobileKeyField="summary"
            rows={rows}
            meta={meta}
            columns={[
              { field: 'addondt', headerName: 'When', render: (r) => when(r.addondt) },
              { field: 'userName', headerName: 'User', render: (r) => r.userName || <Typography variant="caption" color="text.disabled">system</Typography> },
              { field: 'action', headerName: 'Action', render: (r) => (
                <Chip label={r.action} size="small" color={ACTION_COLORS[r.action] || 'default'} sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
              )},
              { field: 'entity', headerName: 'Type', render: (r) => (
                <Chip label={r.entity} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
              )},
              { field: 'summary', headerName: 'What happened', render: (r) => (
                <Typography variant="body2">{r.summary || '—'}</Typography>
              )},
              { field: 'changes', headerName: 'Details', render: (r) => (
                r.changes
                  ? <Typography variant="caption" color="primary.main" sx={{ cursor: 'pointer' }} onClick={() => setViewing(r)}>View changes</Typography>
                  : <Typography variant="caption" color="text.disabled">—</Typography>
              )},
            ]}
          />
          <Pagination
            meta={meta}
            onChangePage={(p) => setQuery({ ...query, page: p })}
            onChangeLimit={(l) => setQuery({ ...query, limit: l, page: 1 })}
          />
        </>
      )}

      <Modal open={Boolean(viewing)} title={viewing?.summary || 'Changes'} onClose={() => setViewing(null)} maxWidth="sm">
        {viewing && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip size="small" label={viewing.action} color={ACTION_COLORS[viewing.action] || 'default'} sx={{ fontWeight: 700 }} />
              <Chip size="small" variant="outlined" label={`${viewing.entity}${viewing.entityId ? ` #${viewing.entityId}` : ''}`} />
              <Chip size="small" variant="outlined" label={when(viewing.addondt)} />
            </Stack>

            <Typography variant="caption" color="text.secondary">
              {viewing.userName || 'system'}
              {viewing.ipAddress ? ` · ${viewing.ipAddress}` : ''}
              {viewing.method ? ` · ${viewing.method} ${viewing.path}` : ''}
            </Typography>

            <Box sx={{ maxHeight: 380, overflowY: 'auto' }}>
              {Object.entries(viewing.changes || {}).map(([field, value]) => {
                // Updates store { from, to }; creates and deletes store the value.
                const isDiff = value && typeof value === 'object' && ('from' in value || 'to' in value);
                return (
                  <Stack
                    key={field}
                    sx={{ py: 0.85, borderBottom: 1, borderColor: 'divider' }}
                  >
                    <Typography variant="caption" fontWeight={700} color="text.secondary">{field}</Typography>
                    {isDiff ? (
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Box sx={{ px: 0.75, borderRadius: 1, bgcolor: alpha(theme.palette.error.main, 0.08) }}>
                          <Typography variant="body2" component="span">{String(value.from ?? '—')}</Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">→</Typography>
                        <Box sx={{ px: 0.75, borderRadius: 1, bgcolor: alpha(theme.palette.success.main, 0.1) }}>
                          <Typography variant="body2" component="span">{String(value.to ?? '—')}</Typography>
                        </Box>
                      </Stack>
                    ) : (
                      <Typography variant="body2">{String(value ?? '—')}</Typography>
                    )}
                  </Stack>
                );
              })}
              {!Object.keys(viewing.changes || {}).length && (
                <Typography variant="body2" color="text.secondary">No field details recorded.</Typography>
              )}
            </Box>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
