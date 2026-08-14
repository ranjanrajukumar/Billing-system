import AddIcon from '@mui/icons-material/Add';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import {
  Box, Button, Grid, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { currency, date as fmtDate } from '../utils/formatters.js';
import { branchesApi, cashApi } from '../services/resource.service.js';

/**
 * Bank accounts and their statements.
 *
 * The balance shown is the sum of the account's transactions, never a figure
 * typed in — which is why the edit form has no balance field.
 */
const ENTRY_TYPES = [
  'Deposit', 'Withdrawal', 'Customer Receipt', 'Supplier Payment',
  'Transfer In', 'Transfer Out', 'Charges', 'Interest',
];

export default function BankAccounts() {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entry, setEntry] = useState({ entryType: 'Deposit', amount: '', instrumentNo: '', partyName: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [list, locs] = await Promise.all([cashApi.banks(), branchesApi.list({ limit: 200 })]);
      setRows(list || []);
      setLocations(locs?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load bank accounts', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openBlank = () => setEditing({
    accountName: '', bankName: '', accountNumber: '', ifsc: '',
    branchName: '', branchId: '', openingBalance: '',
  });

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...editing,
        branchId: editing.branchId ? Number(editing.branchId) : null,
        openingBalance: Number(editing.openingBalance || 0),
      };
      if (editing.id) await cashApi.updateBank(editing.id, payload);
      else await cashApi.createBank(payload);
      showToast('Bank account saved');
      setEditing(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the account', 'error');
    }
    setBusy(false);
  };

  const openDetail = async (row) => {
    try {
      const txns = await cashApi.bankEntries(row.id, { limit: 200 });
      setDetail(row);
      setEntries(txns?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open the statement', 'error');
    }
  };

  const addEntry = async () => {
    setBusy(true);
    try {
      await cashApi.addBankEntry(detail.id, { ...entry, amount: Number(entry.amount || 0) });
      showToast('Transaction recorded');
      setEntry({ entryType: 'Deposit', amount: '', instrumentNo: '', partyName: '', notes: '' });
      const [txns, refreshed] = await Promise.all([
        cashApi.bankEntries(detail.id, { limit: 200 }),
        cashApi.banks(),
      ]);
      setEntries(txns?.data || []);
      setRows(refreshed || []);
      setDetail((refreshed || []).find((b) => b.id === detail.id) || detail);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not record the transaction', 'error');
    }
    setBusy(false);
  };

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Bank Accounts"
        subtitle="Balances and statements for the accounts the business banks through"
        icon={<AccountBalanceIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={openBlank}>Add Account</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={6}>
          <StatsCard title="Accounts" value={rows.length} detail="Active" icon={<AccountBalanceIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} sm={6}>
          <StatsCard
            title="Total balance"
            value={currency(rows.reduce((s, r) => s + Number(r.currentBalance || 0), 0))}
            detail="Across all accounts" icon={<AccountBalanceIcon />} gradient="success"
          />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="accountName"
          rows={rows}
          columns={[
            { field: 'accountName', headerName: 'Account', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.accountName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {[r.bankName, r.accountNumber].filter(Boolean).join(' · ') || '—'}
                </Typography>
              </Box>
            )},
            { field: 'ifsc', headerName: 'IFSC', render: (r) => r.ifsc || '—' },
            { field: 'branch', headerName: 'Location', render: (r) => r.Branch?.branchName || 'Company-wide' },
            { field: 'currentBalance', headerName: 'Balance', render: (r) => (
              <Typography fontWeight={700} color={Number(r.currentBalance) < 0 ? 'error.main' : 'success.main'}>
                {currency(r.currentBalance)}
              </Typography>
            )},
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5}>
                <Button size="small" onClick={() => openDetail(r)}>Statement</Button>
                <Button size="small" onClick={() => setEditing({ ...r })}>Edit</Button>
              </Stack>
            )},
          ]}
        />
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit Bank Account' : 'Add Bank Account'} onClose={() => setEditing(null)} maxWidth="sm">
        {editing && (
          <Stack spacing={2}>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="Account name" value={editing.accountName || ''}
                  onChange={(e) => setEditing({ ...editing, accountName: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="Bank" value={editing.bankName || ''}
                  onChange={(e) => setEditing({ ...editing, bankName: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="Account number" value={editing.accountNumber || ''}
                  onChange={(e) => setEditing({ ...editing, accountNumber: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="IFSC" value={editing.ifsc || ''}
                  onChange={(e) => setEditing({ ...editing, ifsc: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth size="small" label="Belongs to" value={editing.branchId || ''}
                  onChange={(e) => setEditing({ ...editing, branchId: e.target.value })} InputLabelProps={{ shrink: true }}>
                  <MenuItem value=""><em>Company-wide</em></MenuItem>
                  {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.branchName}</MenuItem>)}
                </TextField>
              </Grid>
              {!editing.id && (
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small" type="number" label="Opening balance" value={editing.openingBalance ?? ''}
                    onChange={(e) => setEditing({ ...editing, openingBalance: e.target.value })}
                    InputLabelProps={{ shrink: true }} inputProps={{ step: 'any' }}
                    helperText="Set once; afterwards the balance follows the transactions" />
                </Grid>
              )}
            </Grid>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy || !editing.accountName} onClick={save} sx={{ borderRadius: 2 }}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      <Modal open={Boolean(detail)} title={detail?.accountName || ''} onClose={() => setDetail(null)} maxWidth="md">
        {detail && (
          <Stack spacing={2}>
            <StatsCard
              title="Current balance" value={currency(detail.currentBalance)}
              detail={[detail.bankName, detail.accountNumber].filter(Boolean).join(' · ')}
              icon={<AccountBalanceIcon />} gradient="primary"
            />

            <Paper variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={12} sm={3}>
                  <TextField select fullWidth size="small" label="Type" value={entry.entryType}
                    onChange={(e) => setEntry({ ...entry, entryType: e.target.value })} InputLabelProps={{ shrink: true }}>
                    {ENTRY_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth size="small" type="number" label="Amount" value={entry.amount}
                    onChange={(e) => setEntry({ ...entry, amount: e.target.value })}
                    InputLabelProps={{ shrink: true }} inputProps={{ min: 0, step: 'any' }} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth size="small" label="Cheque/Ref" value={entry.instrumentNo}
                    onChange={(e) => setEntry({ ...entry, instrumentNo: e.target.value })} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Party / note" value={entry.partyName}
                    onChange={(e) => setEntry({ ...entry, partyName: e.target.value })} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12} sm={1}>
                  <Button fullWidth variant="outlined" disabled={busy || !(Number(entry.amount) > 0)}
                    onClick={addEntry} sx={{ borderRadius: 2 }}>Add</Button>
                </Grid>
              </Grid>
            </Paper>

            <Paper variant="outlined" sx={{ borderRadius: 2, maxHeight: 340, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Reference</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>In</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Out</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell>{fmtDate(t.transactionDate)}</TableCell>
                      <TableCell>{t.entryType}</TableCell>
                      <TableCell>{t.instrumentNo || t.referenceNumber || t.partyName || '—'}</TableCell>
                      <TableCell align="right">{Number(t.amountIn) ? currency(t.amountIn) : '—'}</TableCell>
                      <TableCell align="right">{Number(t.amountOut) ? currency(t.amountOut) : '—'}</TableCell>
                      <TableCell align="right"><strong>{currency(t.balance)}</strong></TableCell>
                    </TableRow>
                  ))}
                  {!entries.length && (
                    <TableRow><TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                        No transactions on this account yet.
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
