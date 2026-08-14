import AddIcon from '@mui/icons-material/Add';
import PaymentsIcon from '@mui/icons-material/Payments';
import {
  Box, Button, Grid, MenuItem, Stack, TextField, Typography,
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
import api from '../services/api.js';
import { branchesApi, cashApi, expensesApi } from '../services/resource.service.js';

/**
 * Running costs, booked against the location that incurred them.
 *
 * Recording an expense and paying it are separate steps on purpose: the first
 * says money is owed, the second says it left the till or the bank. Collapsing
 * them would hide everything committed but not yet paid.
 */
export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [registers, setRegisters] = useState([]);
  const [banks, setBanks] = useState([]);
  const [summary, setSummary] = useState({ total: 0, byCategory: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [payment, setPayment] = useState({ cashRegisterId: '', bankAccountId: '', paymentMode: 'Cash' });
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [list, cats, locs, sum] = await Promise.all([
        expensesApi.list({ limit: 100 }),
        api.get('/master-data/expenseCategory', { params: { limit: 100 } }).then((r) => r.data).catch(() => ({ data: [] })),
        branchesApi.list({ limit: 200 }),
        expensesApi.summary().catch(() => ({ total: 0, byCategory: [] })),
      ]);
      setRows(list?.data || []);
      setCategories(cats?.data || []);
      setLocations(locs?.data || []);
      setSummary(sum);

      // Cash and bank are a separate module; a business may not run them.
      const [regs, bankList] = await Promise.all([
        cashApi.registers({ status: 'Open' }).catch(() => ({ data: [] })),
        cashApi.banks().catch(() => []),
      ]);
      setRegisters(regs?.data || []);
      setBanks(bankList || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load expenses', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openBlank = () => setEditing({
    branchId: '', categoryId: '', expenseDate: new Date().toISOString().slice(0, 10),
    amount: '', taxAmount: 0, payeeName: '', referenceNo: '', remarks: '',
  });

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...editing,
        branchId: editing.branchId ? Number(editing.branchId) : undefined,
        categoryId: editing.categoryId ? Number(editing.categoryId) : null,
        amount: Number(editing.amount || 0),
        taxAmount: Number(editing.taxAmount || 0),
      };
      if (editing.id) await expensesApi.update(editing.id, payload);
      else await expensesApi.create(payload);
      showToast('Expense saved');
      setEditing(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the expense', 'error');
    }
    setBusy(false);
  };

  const act = async (row, action) => {
    setBusy(true);
    try {
      const reason = action === 'reject' ? window.prompt('Why is this rejected?') || '' : undefined;
      await expensesApi[action](row.id, reason);
      showToast(`Expense ${action}${action.endsWith('e') ? 'd' : 'ed'}`);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || `Could not ${action} the expense`, 'error');
    }
    setBusy(false);
  };

  const pay = async () => {
    setBusy(true);
    try {
      await expensesApi.pay(paying.id, {
        cashRegisterId: payment.cashRegisterId ? Number(payment.cashRegisterId) : undefined,
        bankAccountId: payment.bankAccountId ? Number(payment.bankAccountId) : undefined,
        paymentMode: payment.paymentMode,
      });
      showToast('Expense paid');
      setPaying(null);
      setPayment({ cashRegisterId: '', bankAccountId: '', paymentMode: 'Cash' });
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not pay the expense', 'error');
    }
    setBusy(false);
  };

  const unpaid = rows.filter((r) => ['Draft', 'Pending Approval', 'Approved'].includes(r.status));

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Expenses"
        subtitle="What it costs to run each location, from rent to packaging"
        icon={<PaymentsIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={openBlank}>Record Expense</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Total recorded" value={currency(summary.total)} detail="All expenses" icon={<PaymentsIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard
            title="Unpaid" value={currency(unpaid.reduce((s, r) => s + Number(r.totalAmount || 0), 0))}
            detail={`${unpaid.length} awaiting payment`} icon={<PaymentsIcon />} gradient="warning"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatsCard
            title="Paid" value={currency(rows.filter((r) => r.status === 'Paid').reduce((s, r) => s + Number(r.totalAmount || 0), 0))}
            detail="Money actually out" icon={<PaymentsIcon />} gradient="success"
          />
        </Grid>
      </Grid>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="expenseNumber"
          rows={rows}
          columns={[
            { field: 'expenseNumber', headerName: 'Expense', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.expenseNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{fmtDate(r.expenseDate)}</Typography>
              </Box>
            )},
            { field: 'category', headerName: 'Category', render: (r) => r.ExpenseCategory?.name || '—' },
            { field: 'branch', headerName: 'Location', render: (r) => r.Branch?.branchName || '—' },
            { field: 'payeeName', headerName: 'Paid to', render: (r) => r.payeeName || '—' },
            { field: 'totalAmount', headerName: 'Amount', render: (r) => (
              <Typography fontWeight={700}>{currency(r.totalAmount)}</Typography>
            )},
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                {['Draft', 'Pending Approval'].includes(r.status) && (
                  <>
                    <Button size="small" onClick={() => setEditing({ ...r })}>Edit</Button>
                    <Button size="small" variant="outlined" disabled={busy} onClick={() => act(r, 'approve')}>Approve</Button>
                    <Button size="small" color="error" disabled={busy} onClick={() => act(r, 'reject')}>Reject</Button>
                  </>
                )}
                {r.status === 'Approved' && (
                  <Button size="small" variant="outlined" onClick={() => setPaying(r)}>Pay</Button>
                )}
                {r.status !== 'Cancelled' && r.status !== 'Rejected' && (
                  <Button size="small" color="error" disabled={busy} onClick={() => act(r, 'cancel')}>Cancel</Button>
                )}
              </Stack>
            )},
          ]}
        />
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit Expense' : 'Record Expense'} onClose={() => setEditing(null)} maxWidth="sm">
        {editing && (
          <Stack spacing={2}>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth size="small" label="Category" value={editing.categoryId || ''}
                  onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })} InputLabelProps={{ shrink: true }}>
                  {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth size="small" label="Location" value={editing.branchId || ''}
                  onChange={(e) => setEditing({ ...editing, branchId: e.target.value })} InputLabelProps={{ shrink: true }}>
                  {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.branchName}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" type="date" label="Date" value={editing.expenseDate || ''}
                  onChange={(e) => setEditing({ ...editing, expenseDate: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="Paid to" value={editing.payeeName || ''}
                  onChange={(e) => setEditing({ ...editing, payeeName: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth size="small" type="number" label="Amount" value={editing.amount ?? ''}
                  onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                  InputLabelProps={{ shrink: true }} inputProps={{ min: 0, step: 'any' }} />
              </Grid>
              <Grid item xs={6}>
                <TextField fullWidth size="small" type="number" label="Tax" value={editing.taxAmount ?? 0}
                  onChange={(e) => setEditing({ ...editing, taxAmount: e.target.value })}
                  InputLabelProps={{ shrink: true }} inputProps={{ min: 0, step: 'any' }} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth size="small" label="Remarks" multiline minRows={2} value={editing.remarks || ''}
                  onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
            </Grid>
            <Typography variant="body2" align="right">
              Total: <strong>{currency(Number(editing.amount || 0) + Number(editing.taxAmount || 0))}</strong>
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy || !(Number(editing.amount) > 0)} onClick={save} sx={{ borderRadius: 2 }}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      <Modal open={Boolean(paying)} title={`Pay ${paying?.expenseNumber || ''}`} onClose={() => setPaying(null)} maxWidth="xs">
        {paying && (
          <Stack spacing={2}>
            <Typography variant="body2">
              Paying <strong>{currency(paying.totalAmount)}</strong> to {paying.payeeName || 'payee'}.
            </Typography>
            <TextField select fullWidth size="small" label="Pay from a cash register"
              value={payment.cashRegisterId}
              onChange={(e) => setPayment({ cashRegisterId: e.target.value, bankAccountId: '', paymentMode: 'Cash' })}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {registers.map((r) => <MenuItem key={r.id} value={r.id}>{r.registerName}</MenuItem>)}
            </TextField>
            <Typography variant="caption" color="text.secondary" align="center">or</Typography>
            <TextField select fullWidth size="small" label="Pay from a bank account"
              value={payment.bankAccountId}
              onChange={(e) => setPayment({ bankAccountId: e.target.value, cashRegisterId: '', paymentMode: 'Bank' })}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {banks.map((b) => <MenuItem key={b.id} value={b.id}>{b.accountName}</MenuItem>)}
            </TextField>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setPaying(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button
                variant="contained" sx={{ borderRadius: 2 }}
                disabled={busy || (!payment.cashRegisterId && !payment.bankAccountId)}
                onClick={pay}
              >
                {busy ? 'Paying…' : 'Confirm Payment'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
