import AddIcon from '@mui/icons-material/Add';
import ArticleIcon from '@mui/icons-material/Article';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert, Box, Button, Grid, IconButton, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import useRequiredFields from '../../hooks/useRequiredFields.js';
import { currency, date as fmtDate } from '../../utils/formatters.js';
import { accountingApi } from '../../services/resource.service.js';

/**
 * The journal.
 *
 * Most entries here were posted automatically by a sale, purchase or payment;
 * the manual voucher is for the rest. A posted entry is never edited or
 * deleted — a mistake is corrected by posting a reversal, so the record of what
 * was believed and when survives the correction.
 */
const blankLine = () => ({ accountId: '', debit: '', credit: '', narration: '' });

export default function JournalEntries() {
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  // A voucher needs a date to fall in a period and a narration to be readable
  // a year later. Its lines are balanced separately.
  const journalFields = useRequiredFields([
    { name: 'entryDate', label: 'Entry date' },
    { name: 'narration', label: 'Narration' },
  ]);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [list, accs] = await Promise.all([
        accountingApi.entries({ limit: 100 }),
        accountingApi.accounts({ postable: 'true' }),
      ]);
      setRows(list?.data || []);
      setAccounts(accs || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load the journal', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openBlank = () => setCreating({
    entryDate: new Date().toISOString().slice(0, 10),
    narration: '',
    lines: [blankLine(), blankLine()],
  });

  const setLine = (index, patch) => setCreating((c) => ({
    ...c,
    lines: c.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
  }));

  const totals = (lines = []) => ({
    debit: lines.reduce((s, l) => s + Number(l.debit || 0), 0),
    credit: lines.reduce((s, l) => s + Number(l.credit || 0), 0),
  });

  const save = async () => {
    if (!journalFields.check(creating, showToast)) return;

    const t = totals(creating.lines);
    const balanced = Math.abs(t.debit - t.credit) < 0.01 && t.debit > 0;
    if (!balanced) { showToast('Debits must equal credits and be greater than zero', 'error'); return; }
    const invalid = creating.lines.find(l => Number(l.debit) < 0 || Number(l.credit) < 0);
    if (invalid) { showToast('Debits and credits cannot be negative', 'error'); return; }
    setBusy(true);
    try {
      await accountingApi.createEntry({
        entryDate: creating.entryDate,
        narration: creating.narration,
        lines: creating.lines
          .filter((l) => l.accountId && (Number(l.debit) || Number(l.credit)))
          .map((l) => ({
            accountId: Number(l.accountId),
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            narration: l.narration,
          })),
      });
      showToast('Journal entry posted');
      setCreating(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not post the entry', 'error');
    }
    setBusy(false);
  };

  const reverse = async (row) => {
    const narration = window.prompt('Why is this being reversed?') || undefined;
    setBusy(true);
    try {
      await accountingApi.reverseEntry(row.id, { narration });
      showToast('Reversal posted — the original entry is untouched');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not reverse the entry', 'error');
    }
    setBusy(false);
  };

  const t = creating ? totals(creating.lines) : { debit: 0, credit: 0 };
  const balanced = Math.abs(t.debit - t.credit) < 0.01 && t.debit > 0;

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Journal Entries"
        subtitle="Every posting the business has made, automatic and manual"
        icon={<ArticleIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={openBlank}>New Voucher</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Entries" value={rows.length} detail="Recent postings" icon={<ArticleIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Automatic" value={rows.filter((r) => r.sourceType !== 'Manual').length} detail="From documents" icon={<ArticleIcon />} gradient="info" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Reversed" value={rows.filter((r) => r.status === 'Reversed').length} detail="Corrected, not deleted" icon={<ArticleIcon />} gradient="warning" />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="entryNumber"
          rows={rows}
          columns={[
            { field: 'entryNumber', headerName: 'Voucher', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.entryNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{fmtDate(r.entryDate)}</Typography>
              </Box>
            )},
            { field: 'sourceType', headerName: 'Source', render: (r) => (
              <Box>
                <Typography variant="body2">{r.sourceType}</Typography>
                {r.sourceNumber && <Typography variant="caption" color="text.secondary">{r.sourceNumber}</Typography>}
              </Box>
            )},
            { field: 'narration', headerName: 'Narration', render: (r) => r.narration || '—' },
            { field: 'totalDebit', headerName: 'Amount', render: (r) => (
              <Typography fontWeight={700}>{currency(r.totalDebit)}</Typography>
            )},
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5}>
                <Button size="small" onClick={() => accountingApi.entry(r.id).then(setViewing)}>View</Button>
                {r.status === 'Posted' && !r.reversedById && (
                  <Button size="small" color="warning" disabled={busy} onClick={() => reverse(r)}>Reverse</Button>
                )}
              </Stack>
            )},
          ]}
        />
      )}

      {/* Manual voucher */}
      <Modal open={Boolean(creating)} title="New Journal Voucher" onClose={() => setCreating(null)} maxWidth="md">
        {creating && (
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Debits must equal credits. The entry will be refused otherwise — an unbalanced entry is not a
              slightly wrong entry, it is a corrupt ledger.
            </Alert>

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth size="small" type="date" label="Date" {...journalFields.fieldProps('entryDate', creating)} value={creating.entryDate}
                  onChange={(e) => setCreating({ ...creating, entryDate: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField fullWidth size="small" label="Narration" {...journalFields.fieldProps('narration', creating)} value={creating.narration}
                  onChange={(e) => setCreating({ ...creating, narration: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
            </Grid>

            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Account</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Debit</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Credit</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Narration</TableCell>
                      <TableCell width={48} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {creating.lines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <TextField select fullWidth size="small" value={line.accountId}
                            onChange={(e) => setLine(index, { accountId: e.target.value })}>
                            <MenuItem value=""><em>Select account</em></MenuItem>
                            {accounts.map((a) => (
                              <MenuItem key={a.id} value={a.id}>{a.code} — {a.name}</MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell align="right">
                          <TextField size="small" type="number" sx={{ width: 110 }} value={line.debit}
                            onChange={(e) => setLine(index, { debit: e.target.value, credit: '' })}
                            inputProps={{ style: { textAlign: 'right' }, min: 0, step: 'any' }} />
                        </TableCell>
                        <TableCell align="right">
                          <TextField size="small" type="number" sx={{ width: 110 }} value={line.credit}
                            onChange={(e) => setLine(index, { credit: e.target.value, debit: '' })}
                            inputProps={{ style: { textAlign: 'right' }, min: 0, step: 'any' }} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" fullWidth value={line.narration}
                            onChange={(e) => setLine(index, { narration: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" color="error" disabled={creating.lines.length <= 2}
                            onClick={() => setCreating({ ...creating, lines: creating.lines.filter((_, i) => i !== index) })}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell><strong>Totals</strong></TableCell>
                      <TableCell align="right"><strong>{currency(t.debit)}</strong></TableCell>
                      <TableCell align="right"><strong>{currency(t.credit)}</strong></TableCell>
                      <TableCell colSpan={2}>
                        <Typography variant="caption" color={balanced ? 'success.main' : 'error.main'} fontWeight={700}>
                          {balanced ? 'Balanced' : `Out by ${currency(Math.abs(t.debit - t.credit))}`}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
              <Box sx={{ p: 1.5 }}>
                <Button size="small" startIcon={<AddIcon />}
                  onClick={() => setCreating({ ...creating, lines: [...creating.lines, blankLine()] })}>
                  Add Line
                </Button>
              </Box>
            </Paper>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setCreating(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy || !balanced} onClick={save} sx={{ borderRadius: 2 }}>
                {busy ? 'Posting…' : 'Post Entry'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Detail */}
      <Modal open={Boolean(viewing)} title={viewing?.entryNumber || ''} onClose={() => setViewing(null)} maxWidth="md">
        {viewing && (
          <Stack spacing={2}>
            <Grid container spacing={1}>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Date</Typography><Typography variant="body2" fontWeight={600}>{fmtDate(viewing.entryDate)}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Source</Typography><Typography variant="body2" fontWeight={600}>{viewing.sourceType} {viewing.sourceNumber || ''}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Amount</Typography><Typography variant="body2" fontWeight={600}>{currency(viewing.totalDebit)}</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Status</Typography><Box><StatusChip status={viewing.status} /></Box></Grid>
            </Grid>

            {viewing.narration && <Typography variant="body2">{viewing.narration}</Typography>}

            <Paper variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Account</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Debit</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Credit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(viewing.JournalEntryLines || []).map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Typography variant="body2">
                          {line.ChartOfAccount?.code} — {line.ChartOfAccount?.name}
                        </Typography>
                        {line.narration && <Typography variant="caption" color="text.secondary">{line.narration}</Typography>}
                      </TableCell>
                      <TableCell align="right">{Number(line.debit) ? currency(line.debit) : '—'}</TableCell>
                      <TableCell align="right">{Number(line.credit) ? currency(line.credit) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
