import AddIcon from '@mui/icons-material/Add';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LockIcon from '@mui/icons-material/Lock';
import {
  Alert, Box, Button, Chip, Grid, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { currency, date as fmtDate } from '../utils/formatters.js';
import { accountingApi } from '../services/resource.service.js';

/**
 * The chart of accounts, shown as the tree it is.
 *
 * Accounts marked with a lock are the ones automatic postings look up by code —
 * their name can be changed to suit the business, but not their code or type,
 * because a sale has to know where its revenue goes.
 */
const TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];
const TYPE_COLOUR = {
  Asset: 'primary', Liability: 'warning', Equity: 'secondary', Income: 'success', Expense: 'error',
};

export default function ChartOfAccounts() {
  const [tree, setTree] = useState([]);
  const [flat, setFlat] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [t, f] = await Promise.all([accountingApi.accountTree(), accountingApi.accounts()]);
      setTree(t || []);
      setFlat(f || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load the chart of accounts', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const seed = async () => {
    setBusy(true);
    try {
      const result = await accountingApi.seed();
      showToast(result.message);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not set up the chart', 'error');
    }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editing.id) await accountingApi.updateAccount(editing.id, editing);
      else await accountingApi.createAccount(editing);
      showToast('Account saved');
      setEditing(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the account', 'error');
    }
    setBusy(false);
  };

  const openLedger = async (account) => {
    try {
      setLedger(await accountingApi.generalLedger(account.id, {}));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open that ledger', 'error');
    }
  };

  const renderRows = (nodes, depth = 0) => nodes.flatMap((node) => [
    <TableRow key={node.id} hover>
      <TableCell sx={{ pl: 2 + depth * 3 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{node.code}</Typography>
          <Typography variant="body2" fontWeight={node.isGroup ? 700 : 500}>{node.name}</Typography>
          {node.isSystem && (
            <Tooltip title="Used by automatic postings — code and type are fixed">
              <LockIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
            </Tooltip>
          )}
        </Stack>
      </TableCell>
      <TableCell>
        <Chip label={node.accountType} size="small" color={TYPE_COLOUR[node.accountType]} variant="outlined" sx={{ fontSize: '0.65rem' }} />
      </TableCell>
      <TableCell align="right">
        {node.isGroup ? '—' : (
          <Typography variant="body2" fontWeight={600}>{currency(node.currentBalance)}</Typography>
        )}
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          {!node.isGroup && <Button size="small" onClick={() => openLedger(node)}>Ledger</Button>}
          <Button size="small" onClick={() => setEditing({ ...node })}>Edit</Button>
        </Stack>
      </TableCell>
    </TableRow>,
    ...renderRows(node.children || [], depth + 1),
  ]);

  const byType = (type) => flat.filter((a) => a.accountType === type && !a.isGroup)
    .reduce((s, a) => s + Number(a.currentBalance || 0), 0);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Chart of Accounts"
        subtitle="The accounts every transaction in the business posts to"
        icon={<AccountTreeIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {!flat.length && (
              <Button variant="outlined" disabled={busy} onClick={seed}>Set Up Standard Chart</Button>
            )}
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setEditing({
              code: '', name: '', accountType: 'Expense', normalBalance: 'Debit', parentId: '', openingBalance: 0,
            })}>
              Add Account
            </Button>
          </Stack>
        }
      />

      {!flat.length && !loading && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No accounts yet. Setting up the standard chart gives you the accounts that sales, purchases,
          payments and expenses post to automatically.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}><StatsCard title="Assets" value={currency(byType('Asset'))} detail="What we own" icon={<AccountTreeIcon />} gradient="primary" /></Grid>
        <Grid item xs={6} sm={3}><StatsCard title="Liabilities" value={currency(byType('Liability'))} detail="What we owe" icon={<AccountTreeIcon />} gradient="warning" /></Grid>
        <Grid item xs={6} sm={3}><StatsCard title="Income" value={currency(byType('Income'))} detail="Earned" icon={<AccountTreeIcon />} gradient="success" /></Grid>
        <Grid item xs={6} sm={3}><StatsCard title="Expenses" value={currency(byType('Expense'))} detail="Spent" icon={<AccountTreeIcon />} gradient="danger" /></Grid>
      </Grid>

      {loading ? <Loader /> : (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Account</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Balance</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>{renderRows(tree)}</TableBody>
            </Table>
          </Box>
        </Paper>
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit Account' : 'Add Account'} onClose={() => setEditing(null)} maxWidth="sm">
        {editing && (
          <Stack spacing={2}>
            {editing.isSystem && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                This account is used by automatic postings. You can rename it, but its code and type are fixed.
              </Alert>
            )}
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth size="small" label="Code" value={editing.code || ''} disabled={editing.isSystem}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField fullWidth size="small" label="Name" value={editing.name || ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth size="small" label="Type" value={editing.accountType || 'Expense'} disabled={editing.isSystem}
                  onChange={(e) => setEditing({
                    ...editing,
                    accountType: e.target.value,
                    // The natural side follows the type; assets and expenses grow
                    // on the debit side, everything else on the credit side.
                    normalBalance: ['Asset', 'Expense'].includes(e.target.value) ? 'Debit' : 'Credit',
                  })}
                  InputLabelProps={{ shrink: true }}>
                  {TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth size="small" label="Normal balance" value={editing.normalBalance || 'Debit'} disabled={editing.isSystem}
                  onChange={(e) => setEditing({ ...editing, normalBalance: e.target.value })} InputLabelProps={{ shrink: true }}>
                  <MenuItem value="Debit">Debit</MenuItem>
                  <MenuItem value="Credit">Credit</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField select fullWidth size="small" label="Inside group" value={editing.parentId || ''}
                  onChange={(e) => setEditing({ ...editing, parentId: e.target.value || null })} InputLabelProps={{ shrink: true }}>
                  <MenuItem value=""><em>Top level</em></MenuItem>
                  {flat.filter((a) => a.isGroup).map((a) => (
                    <MenuItem key={a.id} value={a.id}>{a.code} — {a.name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth size="small" type="number" label="Opening balance" value={editing.openingBalance ?? 0}
                  onChange={(e) => setEditing({ ...editing, openingBalance: e.target.value })}
                  InputLabelProps={{ shrink: true }} inputProps={{ step: 'any' }} />
              </Grid>
            </Grid>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy || !editing.name || !editing.code} onClick={save} sx={{ borderRadius: 2 }}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* General ledger for one account */}
      <Modal open={Boolean(ledger)} title={ledger ? `${ledger.account.code} — ${ledger.account.name}` : ''} onClose={() => setLedger(null)} maxWidth="md">
        {ledger && (
          <Stack spacing={2}>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4}><StatsCard title="Opening" value={currency(ledger.account.openingBalance)} detail="Brought forward" icon={<AccountTreeIcon />} gradient="info" /></Grid>
              <Grid item xs={6} sm={4}><StatsCard title="Movement" value={currency(ledger.totalDebit - ledger.totalCredit)} detail="Debits less credits" icon={<AccountTreeIcon />} gradient="primary" /></Grid>
              <Grid item xs={12} sm={4}><StatsCard title="Closing" value={currency(ledger.closingBalance)} detail="Current balance" icon={<AccountTreeIcon />} gradient="success" /></Grid>
            </Grid>

            <Paper variant="outlined" sx={{ borderRadius: 2, maxHeight: 360, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Voucher</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Narration</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Debit</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Credit</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ledger.rows.map((row, i) => (
                    <TableRow key={i} hover>
                      <TableCell>{fmtDate(row.date)}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{row.entryNumber}</Typography>
                        {row.sourceNumber && <Typography variant="caption" color="text.secondary">{row.sourceNumber}</Typography>}
                      </TableCell>
                      <TableCell>{row.narration || '—'}</TableCell>
                      <TableCell align="right">{row.debit ? currency(row.debit) : '—'}</TableCell>
                      <TableCell align="right">{row.credit ? currency(row.credit) : '—'}</TableCell>
                      <TableCell align="right"><strong>{currency(row.balance)}</strong></TableCell>
                    </TableRow>
                  ))}
                  {!ledger.rows.length && (
                    <TableRow><TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                        Nothing has posted to this account yet.
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
