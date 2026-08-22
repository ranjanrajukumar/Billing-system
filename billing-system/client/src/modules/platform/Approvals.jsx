import AddIcon from '@mui/icons-material/Add';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert, Box, Button, Chip, Grid, IconButton, MenuItem, Paper, Stack,
  Switch, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { currency, date as fmtDate } from '../../utils/formatters.js';
import { approvalsApi, usersApi } from '../../services/resource.service.js';

/**
 * The approval queue and the rules behind it.
 *
 * The thresholds belong to the business, not to us — ₹100,000 is a rounding
 * error to one company and a month's takings to another — so every rule here is
 * editable and none is hard-coded anywhere in the system.
 */
export default function Approvals() {
  const [tab, setTab] = useState(0);
  const [requests, setRequests] = useState([]);
  const [rules, setRules] = useState([]);
  const [options, setOptions] = useState({ documentTypes: [], operators: [], fields: [] });
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [reqs, ruleList, opts, roleList] = await Promise.all([
        approvalsApi.list({ limit: 100 }),
        approvalsApi.rules(),
        approvalsApi.ruleOptions(),
        usersApi.roles.list().catch(() => []),
      ]);
      setRequests(reqs?.data || []);
      setRules(ruleList || []);
      setOptions(opts);
      setRoles(roleList || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load approvals', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const decide = async (row, approved) => {
    const note = window.prompt(approved ? 'Any note with this approval?' : 'Why is this rejected?') || '';
    setBusy(true);
    try {
      await approvalsApi[approved ? 'approve' : 'reject'](row.id, note);
      showToast(approved ? 'Approved' : 'Rejected');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not record the decision', 'error');
    }
    setBusy(false);
  };

  const saveRule = async () => {
    setBusy(true);
    try {
      const payload = {
        ...editing,
        threshold: Number(editing.threshold || 0),
        priority: Number(editing.priority || 100),
      };
      if (editing.id) await approvalsApi.updateRule(editing.id, payload);
      else await approvalsApi.createRule(payload);
      showToast('Rule saved');
      setEditing(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the rule', 'error');
    }
    setBusy(false);
  };

  const toggleRule = async (rule) => {
    try {
      await approvalsApi.updateRule(rule.id, { isActive: !rule.isActive });
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not change the rule', 'error');
    }
  };

  const removeRule = async (rule) => {
    try {
      await approvalsApi.removeRule(rule.id);
      showToast('Rule removed');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove the rule', 'error');
    }
  };

  const fieldLabel = (key) => options.fields.find((f) => f.key === key)?.label || key;
  const pending = requests.filter((r) => r.status === 'Pending');

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Approvals"
        subtitle="What is waiting to be signed off, and the rules that decide when sign-off is needed"
        icon={<TaskAltIcon />}
        action={tab === 1 && (
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setEditing({
            documentType: 'PurchaseOrder', name: '', field: 'grandTotal',
            operator: '>', threshold: '', approverRole: 'Admin', priority: 100, isActive: true,
          })}>
            Add Rule
          </Button>
        )}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Pending" value={pending.length} detail="Waiting on a decision" icon={<TaskAltIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Active rules" value={rules.filter((r) => r.isActive).length} detail="Currently enforced" icon={<TaskAltIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Decided" value={requests.filter((r) => r.status !== 'Pending').length} detail="Approved or rejected" icon={<TaskAltIcon />} gradient="success" />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab label={`Queue${pending.length ? ` (${pending.length})` : ''}`} />
          <Tab label="Rules" />
        </Tabs>
      </Paper>

      {loading ? <Loader /> : tab === 0 ? (
        <DataTable
          mobileKeyField="documentNumber"
          rows={requests}
          columns={[
            { field: 'documentNumber', headerName: 'Document', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.documentNumber || `#${r.documentId}`}</Typography>
                <Typography variant="caption" color="text.secondary">{r.documentType}</Typography>
              </Box>
            )},
            { field: 'reason', headerName: 'Why', render: (r) => (
              <Typography variant="body2">{r.reason || '—'}</Typography>
            )},
            { field: 'amount', headerName: 'Amount', render: (r) => (
              r.amount === null ? '—' : <Typography fontWeight={700}>{currency(r.amount)}</Typography>
            )},
            { field: 'approverRole', headerName: 'Needs', render: (r) => (
              <Chip label={r.approverRole || 'Anyone'} size="small" variant="outlined" sx={{ fontSize: '0.68rem' }} />
            )},
            { field: 'requester', headerName: 'Raised by', render: (r) => r.requester?.name || '—' },
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { field: 'actions', headerName: 'Actions', render: (r) => (
              r.status === 'Pending' ? (
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => decide(r, true)}>Approve</Button>
                  <Button size="small" color="error" disabled={busy} onClick={() => decide(r, false)}>Reject</Button>
                </Stack>
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {r.decider?.name || '—'} · {fmtDate(r.decidedAt)}
                  </Typography>
                  {r.decisionNote && <Typography variant="caption" display="block">{r.decisionNote}</Typography>}
                </Box>
              )
            )},
          ]}
        />
      ) : (
        <Stack spacing={2}>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            A document is checked against these rules when it is submitted; the first one it trips decides who
            has to sign it off. Rules are seeded switched off so nothing starts blocking work you did not ask
            it to block.
          </Alert>

          <DataTable
            mobileKeyField="name"
            rows={rules}
            columns={[
              { field: 'name', headerName: 'Rule', render: (r) => (
                <Box>
                  <Typography fontWeight={700} variant="body2">{r.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.documentType}</Typography>
                </Box>
              )},
              { field: 'condition', headerName: 'When', render: (r) => (
                <Typography variant="body2">
                  {fieldLabel(r.field)} {r.operator} {Number(r.threshold).toLocaleString('en-IN')}
                </Typography>
              )},
              { field: 'approverRole', headerName: 'Approver', render: (r) => (
                <Chip label={r.approverRole} size="small" variant="outlined" sx={{ fontSize: '0.68rem' }} />
              )},
              { field: 'priority', headerName: 'Priority' },
              { field: 'isActive', headerName: 'Active', render: (r) => (
                <Switch size="small" checked={Boolean(r.isActive)} onChange={() => toggleRule(r)} />
              )},
              { field: 'actions', headerName: 'Actions', render: (r) => (
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" onClick={() => setEditing({ ...r })}>Edit</Button>
                  <IconButton size="small" color="error" onClick={() => removeRule(r)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              )},
            ]}
          />
        </Stack>
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit Rule' : 'New Approval Rule'} onClose={() => setEditing(null)} maxWidth="sm">
        {editing && (
          <Stack spacing={2}>
            <TextField fullWidth size="small" label="Rule name" value={editing.name || ''}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Large purchase order" InputLabelProps={{ shrink: true }} />

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth size="small" label="Applies to" value={editing.documentType}
                  onChange={(e) => setEditing({ ...editing, documentType: e.target.value })} InputLabelProps={{ shrink: true }}>
                  {options.documentTypes.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth size="small" label="Approver role" value={editing.approverRole}
                  onChange={(e) => setEditing({ ...editing, approverRole: e.target.value })} InputLabelProps={{ shrink: true }}>
                  {(roles.length ? roles.map((r) => r.name) : ['Admin']).map((name) => (
                    <MenuItem key={name} value={name}>{name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={5}>
                <TextField select fullWidth size="small" label="When" value={editing.field}
                  onChange={(e) => setEditing({ ...editing, field: e.target.value })} InputLabelProps={{ shrink: true }}>
                  {options.fields.map((f) => <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={5} sm={3}>
                <TextField select fullWidth size="small" label="Is" value={editing.operator}
                  onChange={(e) => setEditing({ ...editing, operator: e.target.value })} InputLabelProps={{ shrink: true }}>
                  {options.operators.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={7} sm={4}>
                <TextField fullWidth size="small" type="number" label="Threshold" value={editing.threshold ?? ''}
                  onChange={(e) => setEditing({ ...editing, threshold: e.target.value })}
                  InputLabelProps={{ shrink: true }} inputProps={{ min: 0, step: 'any' }} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth size="small" type="number" label="Priority" value={editing.priority ?? 100}
                  onChange={(e) => setEditing({ ...editing, priority: e.target.value })}
                  InputLabelProps={{ shrink: true }} helperText="Lower runs first" />
              </Grid>
              <Grid item xs={6}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ height: '100%' }}>
                  <Switch checked={Boolean(editing.isActive)}
                    onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
                  <Typography variant="body2">Active</Typography>
                </Stack>
              </Grid>
            </Grid>

            {editing.name && editing.threshold !== '' && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                A <strong>{editing.documentType}</strong> whose {fieldLabel(editing.field).toLowerCase()}{' '}
                is {editing.operator} {Number(editing.threshold).toLocaleString('en-IN')} will wait for{' '}
                <strong>{editing.approverRole}</strong> approval.
              </Alert>
            )}

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy || !editing.name} onClick={saveRule} sx={{ borderRadius: 2 }}>
                {busy ? 'Saving…' : 'Save Rule'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
