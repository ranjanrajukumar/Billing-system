import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import {
  Alert, Box, Button, Grid, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { currency, date as fmtDate } from '../utils/formatters.js';
import { branchesApi, cashApi } from '../services/resource.service.js';

/**
 * Cash registers.
 *
 * A register is opened for a shift and closed against a physical count. The
 * gap between what the ledger says and what was counted is stored rather than
 * corrected away — a till that always balances to the paisa is a till nobody
 * is really counting.
 */
const ENTRY_TYPES = [
  'Cash In', 'Cash Out', 'Customer Collection', 'Supplier Payment',
  'Refund', 'Bank Deposit', 'Bank Withdrawal',
];

export default function CashRegisters() {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entry, setEntry] = useState({ entryType: 'Cash In', amount: '', partyName: '', notes: '' });
  const [openForm, setOpenForm] = useState({ branchId: '', registerName: '', openingBalance: '' });
  const [closeForm, setCloseForm] = useState({ closingBalance: '', remarks: '' });
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [list, locs] = await Promise.all([
        cashApi.registers({ limit: 100 }),
        branchesApi.list({ limit: 200 }),
      ]);
      setRows(list?.data || []);
      setLocations(locs?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load registers', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const open = async () => {
    setBusy(true);
    try {
      await cashApi.open({
        ...openForm,
        branchId: openForm.branchId ? Number(openForm.branchId) : undefined,
        openingBalance: Number(openForm.openingBalance || 0),
      });
      showToast('Register opened');
      setOpening(false);
      setOpenForm({ branchId: '', registerName: '', openingBalance: '' });
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open the register', 'error');
    }
    setBusy(false);
  };

  const startClose = async (row) => {
    const full = await cashApi.register(row.id);
    setClosing(full);
    setCloseForm({ closingBalance: String(full.expectedBalance ?? ''), remarks: '' });
  };

  const close = async () => {
    setBusy(true);
    try {
      const result = await cashApi.close(closing.id, {
        closingBalance: Number(closeForm.closingBalance || 0),
        remarks: closeForm.remarks,
      });
      const variance = Number(result.variance || 0);
      showToast(variance === 0
        ? 'Register closed and balanced'
        : `Register closed with a ${variance < 0 ? 'shortfall' : 'surplus'} of ${currency(Math.abs(variance))}`,
        variance === 0 ? 'success' : 'warning');
      setClosing(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not close the register', 'error');
    }
    setBusy(false);
  };

  const openDetail = async (row) => {
    try {
      const [full, txns] = await Promise.all([
        cashApi.register(row.id),
        cashApi.transactions(row.id, { limit: 200 }),
      ]);
      setDetail(full);
      setEntries(txns?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open the register', 'error');
    }
  };

  const addEntry = async () => {
    setBusy(true);
    try {
      await cashApi.entry(detail.id, { ...entry, amount: Number(entry.amount || 0) });
      showToast('Entry recorded');
      setEntry({ entryType: 'Cash In', amount: '', partyName: '', notes: '' });
      openDetail(detail);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not record the entry', 'error');
    }
    setBusy(false);
  };

  const openRegisters = rows.filter((r) => r.status === 'Open');

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Cash Register"
        subtitle="Open a till for the shift, record what moves through it, close it against a count"
        icon={<PointOfSaleIcon />}
        action={<Button startIcon={<LockOpenIcon />} variant="contained" onClick={() => setOpening(true)}>Open Register</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Open tills" value={openRegisters.length} detail="Currently trading" icon={<PointOfSaleIcon />} gradient="success" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard
            title="Float in hand"
            value={currency(openRegisters.reduce((s, r) => s + Number(r.openingBalance || 0), 0))}
            detail="Opening balances" icon={<PointOfSaleIcon />} gradient="primary"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard
            title="Variance recorded"
            value={currency(rows.reduce((s, r) => s + Math.abs(Number(r.variance || 0)), 0))}
            detail="Across closed shifts" icon={<PointOfSaleIcon />} gradient="warning"
          />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="registerName"
          rows={rows}
          columns={[
            { field: 'registerName', headerName: 'Register', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.registerName}</Typography>
                <Typography variant="caption" color="text.secondary">{r.Branch?.branchName || '—'}</Typography>
              </Box>
            )},
            { field: 'openedAt', headerName: 'Opened', render: (r) => fmtDate(r.openedAt) },
            { field: 'openingBalance', headerName: 'Opening', render: (r) => currency(r.openingBalance) },
            { field: 'closingBalance', headerName: 'Counted', render: (r) => (
              r.closingBalance === null ? '—' : currency(r.closingBalance)
            )},
            { field: 'variance', headerName: 'Variance', render: (r) => (
              r.variance === null ? '—' : (
                <Typography fontWeight={700} color={Number(r.variance) === 0 ? 'success.main' : 'error.main'}>
                  {currency(r.variance)}
                </Typography>
              )
            )},
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5}>
                <Button size="small" onClick={() => openDetail(r)}>Open</Button>
                {r.status === 'Open' && (
                  <Button size="small" variant="outlined" onClick={() => startClose(r)}>Close Shift</Button>
                )}
              </Stack>
            )},
          ]}
        />
      )}

      {/* Open a register */}
      <Modal open={opening} title="Open Cash Register" onClose={() => setOpening(false)} maxWidth="xs">
        <Stack spacing={2}>
          <TextField select fullWidth size="small" label="Location" value={openForm.branchId}
            onChange={(e) => setOpenForm({ ...openForm, branchId: e.target.value })} InputLabelProps={{ shrink: true }}>
            {locations.filter((l) => l.locationType !== 'Warehouse').map((l) => (
              <MenuItem key={l.id} value={l.id}>{l.branchName}</MenuItem>
            ))}
          </TextField>
          <TextField fullWidth size="small" label="Register name" value={openForm.registerName}
            onChange={(e) => setOpenForm({ ...openForm, registerName: e.target.value })}
            placeholder="Counter 1" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth size="small" type="number" label="Opening float" value={openForm.openingBalance}
            onChange={(e) => setOpenForm({ ...openForm, openingBalance: e.target.value })}
            InputLabelProps={{ shrink: true }} inputProps={{ min: 0, step: 'any' }} />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setOpening(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button variant="contained" disabled={busy || !openForm.branchId} onClick={open} sx={{ borderRadius: 2 }}>
              {busy ? 'Opening…' : 'Open'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      {/* Close a shift */}
      <Modal open={Boolean(closing)} title={`Close ${closing?.registerName || ''}`} onClose={() => setClosing(null)} maxWidth="xs">
        {closing && (
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              The ledger says there should be <strong>{currency(closing.expectedBalance)}</strong> in the drawer.
              Enter what you actually counted — any difference is recorded, not hidden.
            </Alert>
            <TextField fullWidth size="small" type="number" label="Counted cash" value={closeForm.closingBalance}
              onChange={(e) => setCloseForm({ ...closeForm, closingBalance: e.target.value })}
              InputLabelProps={{ shrink: true }} inputProps={{ step: 'any' }} autoFocus />
            {closeForm.closingBalance !== '' && (
              <Typography variant="body2" align="center"
                color={Number(closeForm.closingBalance) === Number(closing.expectedBalance) ? 'success.main' : 'error.main'}>
                Variance: <strong>{currency(Number(closeForm.closingBalance) - Number(closing.expectedBalance))}</strong>
              </Typography>
            )}
            <TextField fullWidth size="small" label="Remarks" multiline minRows={2} value={closeForm.remarks}
              onChange={(e) => setCloseForm({ ...closeForm, remarks: e.target.value })} InputLabelProps={{ shrink: true }} />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setClosing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy} onClick={close} sx={{ borderRadius: 2 }}>
                {busy ? 'Closing…' : 'Close Shift'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Register detail */}
      <Modal open={Boolean(detail)} title={detail?.registerName || ''} onClose={() => setDetail(null)} maxWidth="md">
        {detail && (
          <Stack spacing={2}>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4}>
                <StatsCard title="Opening" value={currency(detail.openingBalance)} detail="Float" icon={<PointOfSaleIcon />} gradient="info" />
              </Grid>
              <Grid item xs={6} sm={4}>
                <StatsCard title="Expected now" value={currency(detail.expectedBalance)} detail="Per the ledger" icon={<PointOfSaleIcon />} gradient="primary" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <StatsCard title="Status" value={detail.status} detail={detail.Branch?.branchName || ''} icon={<PointOfSaleIcon />} gradient={detail.status === 'Open' ? 'success' : 'warning'} />
              </Grid>
            </Grid>

            {detail.status === 'Open' && (
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
                  <Grid item xs={6} sm={3}>
                    <TextField fullWidth size="small" label="Party" value={entry.partyName}
                      onChange={(e) => setEntry({ ...entry, partyName: e.target.value })} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField fullWidth size="small" label="Note" value={entry.notes}
                      onChange={(e) => setEntry({ ...entry, notes: e.target.value })} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12} sm={1}>
                    <Button fullWidth variant="outlined" disabled={busy || !(Number(entry.amount) > 0)}
                      onClick={addEntry} sx={{ borderRadius: 2 }}>Add</Button>
                  </Grid>
                </Grid>
              </Paper>
            )}

            <Paper variant="outlined" sx={{ borderRadius: 2, maxHeight: 320, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
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
                      <TableCell>{t.referenceNumber || t.partyName || t.notes || '—'}</TableCell>
                      <TableCell align="right">{Number(t.amountIn) ? currency(t.amountIn) : '—'}</TableCell>
                      <TableCell align="right">{Number(t.amountOut) ? currency(t.amountOut) : '—'}</TableCell>
                      <TableCell align="right"><strong>{currency(t.balance)}</strong></TableCell>
                    </TableRow>
                  ))}
                  {!entries.length && (
                    <TableRow><TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                        Nothing has moved through this register yet.
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
