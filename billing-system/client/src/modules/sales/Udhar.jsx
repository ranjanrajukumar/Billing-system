import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PaymentsIcon from '@mui/icons-material/Payments';
import PrintIcon from '@mui/icons-material/Print';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import {
  alpha, Box, Button, Chip, Divider, Grid, IconButton, MenuItem,
  Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchBox from '../../components/SearchBox.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import useRequiredFields from '../../hooks/useRequiredFields.js';
import api from '../../services/api.js';
import { currency, date } from '../../utils/formatters.js';
import { printDocument } from '../../utils/print.js';

const METHODS = ['Cash', 'Card', 'UPI', 'Bank Transfer'];
const BUCKET_COLORS = { '0-30': 'success', '31-60': 'info', '61-90': 'warning', '90+': 'error' };

export default function Udhar() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ customers: [], totals: {} });
  const [ageing, setAgeing] = useState({ buckets: {}, rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState(null);
  const [collecting, setCollecting] = useState(null);
  const [form, setForm] = useState({ amount: '', paymentMethod: 'Cash', referenceNumber: '' });
  // Money received has to say how much and by what means, or it cannot be
  // reconciled against a till or a bank line later.
  const collectFields = useRequiredFields([
    { name: 'amount', label: 'Amount', positive: true },
    { name: 'paymentMethod', label: 'Payment method' },
  ]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [summary, aged] = await Promise.all([
        api.get('/udhar/summary', { params: { search } }).then((r) => r.data),
        api.get('/udhar/ageing').then((r) => r.data),
      ]);
      setData(summary);
      setAgeing(aged);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load udhar', 'error');
      setData({ customers: [], totals: {} });
      setAgeing({ buckets: {}, rows: [], total: 0 });
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [search]);

  const openLedger = async (row) => {
    try {
      setLedger(await api.get(`/udhar/customer/${row.customerId}`).then((r) => r.data));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load ledger', 'error');
    }
  };

  const openCollect = (row) => {
    setCollecting(row);
    setForm({ amount: String(row.outstanding), paymentMethod: 'Cash', referenceNumber: '' });
  };

  const submitCollect = async () => {
    if (!collectFields.check(form, showToast)) return;

    if (Number(form.amount || 0) <= 0) { showToast('Collection amount must be positive', 'error'); return; }
    if (Number(form.amount || 0) > Number(collecting.outstanding)) { showToast('Collection amount cannot exceed outstanding balance', 'error'); return; }
    setSaving(true);
    try {
      const result = await api.post('/udhar/collect', {
        customerId: collecting.customerId,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        referenceNumber: form.referenceNumber || undefined,
      }).then((r) => r.data);
      const count = result.allocations?.length || 0;
      showToast(`Collected ${currency(result.collected)} across ${count} invoice${count === 1 ? '' : 's'}`);
      setCollecting(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to record payment', 'error');
    }
    setSaving(false);
  };

  const remind = (row) => {
    const text = `Namaste ${row.customerName}, your outstanding balance is ${currency(row.outstanding)}`
      + (row.overdueDays > 0 ? ` (overdue by ${row.overdueDays} days).` : '.')
      + ' Kindly arrange the payment. Thank you.';
    const mobile = String(row.mobileNumber || '').replace(/\D/g, '');
    window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const printLedger = () => {
    if (!ledger) return;
    printDocument({
      title: `Statement — ${ledger.customer.customerName}`,
      subtitle: `Outstanding ${currency(ledger.summary.outstanding)} · ${ledger.customer.mobileNumber || ''}`,
      columns: [
        { header: 'Date', value: (e) => date(e.date) },
        { header: 'Type', value: (e) => e.type },
        { header: 'Reference', value: (e) => e.reference },
        { header: 'Debit', value: (e) => (e.debit ? currency(e.debit) : ''), numeric: true },
        { header: 'Credit', value: (e) => (e.credit ? currency(e.credit) : ''), numeric: true },
        { header: 'Balance', value: (e) => currency(e.balance), numeric: true },
      ],
      rows: ledger.ledger,
      summary: [
        { label: 'Total billed', value: currency(ledger.summary.billed) },
        { label: 'Total paid', value: currency(ledger.summary.paid) },
        { label: 'Outstanding', value: currency(ledger.summary.outstanding), total: true },
      ],
    });
  };

  const buckets = useMemo(
    () => Object.entries(ageing.buckets || {}).map(([label, value]) => ({ label, value })),
    [ageing],
  );

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Udhar (Credit)"
        subtitle="Track money owed by customers, age it, and collect against the oldest bills first"
        icon={<AccountBalanceWalletIcon />}
        action={<SearchBox value={search} onChange={setSearch} placeholder="Search customers…" />}
      />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <StatsCard title="Total Udhar" value={currency(data.totals?.outstanding)} detail="Owed by customers" icon={<AccountBalanceWalletIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Overdue" value={currency(data.totals?.overdue)} detail="Past due date" icon={<AccountBalanceWalletIcon />} gradient="error" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Customers" value={data.totals?.customers || 0} detail="With a balance" icon={<AccountBalanceWalletIcon />} gradient="warning" />
        </Grid>
      </Grid>

      {/* Ageing buckets */}
      <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Ageing</Typography>
        <Grid container spacing={1.5}>
          {buckets.map((bucket) => (
            <Grid item xs={6} md={3} key={bucket.label}>
              <Box sx={{
                p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider',
                bgcolor: alpha(theme.palette[BUCKET_COLORS[bucket.label] || 'primary'].main, 0.06),
              }}>
                <Typography variant="caption" color="text.secondary">{bucket.label} days</Typography>
                <Typography variant="h6" fontWeight={800}>{currency(bucket.value)}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      <Tabs value={tab} onChange={(_e, next) => setTab(next)}>
        <Tab label="By Customer" />
        <Tab label="By Invoice" />
      </Tabs>

      {loading ? <Loader /> : tab === 0 ? (
        <DataTable
          mobileKeyField="customerName"
          rows={data.customers}
          columns={[
            { field: 'customerName', headerName: 'Customer', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.customerName}</Typography>
                <Typography variant="caption" color="text.secondary">{r.mobileNumber}</Typography>
              </Box>
            )},
            { field: 'invoiceCount', headerName: 'Bills' },
            { field: 'billed', headerName: 'Billed', render: (r) => currency(r.billed) },
            { field: 'paid', headerName: 'Paid', render: (r) => <Typography variant="body2" color="success.main">{currency(r.paid)}</Typography> },
            { field: 'outstanding', headerName: 'Udhar', render: (r) => <Typography fontWeight={800} color="error.main">{currency(r.outstanding)}</Typography> },
            { field: 'overdueDays', headerName: 'Overdue', render: (r) => (r.overdueDays > 0
              ? <Chip label={`${r.overdueDays} days`} size="small" color="error" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
              : <Chip label="Within terms" size="small" color="success" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
            )},
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.25}>
                <Tooltip title="Collect payment">
                  <IconButton size="small" color="primary" onClick={() => openCollect(r)} sx={{ borderRadius: 1.5 }}>
                    <PaymentsIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="View statement">
                  <IconButton size="small" onClick={() => openLedger(r)} sx={{ borderRadius: 1.5 }}>
                    <ReceiptLongIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Send reminder">
                  <IconButton size="small" onClick={() => remind(r)} sx={{ borderRadius: 1.5, color: '#25D366' }}>
                    <WhatsAppIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )},
          ]}
        />
      ) : (
        <DataTable
          mobileKeyField="invoiceNumber"
          rows={ageing.rows}
          columns={[
            { field: 'invoiceNumber', headerName: 'Invoice #', render: (r) => <Typography fontWeight={700} color="primary.main">{r.invoiceNumber}</Typography> },
            { field: 'customerName', headerName: 'Customer' },
            { field: 'invoiceDate', headerName: 'Date', render: (r) => date(r.invoiceDate) },
            { field: 'dueDate', headerName: 'Due', render: (r) => (r.dueDate ? date(r.dueDate) : '—') },
            { field: 'ageDays', headerName: 'Age', render: (r) => `${r.ageDays} days` },
            { field: 'bucket', headerName: 'Bucket', render: (r) => (
              <Chip label={r.bucket} size="small" color={BUCKET_COLORS[r.bucket] || 'default'} sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
            )},
            { field: 'outstanding', headerName: 'Outstanding', render: (r) => <Typography fontWeight={800} color="error.main">{currency(r.outstanding)}</Typography> },
          ]}
        />
      )}

      {/* Collect payment */}
      <Modal open={Boolean(collecting)} title={`Collect from ${collecting?.customerName || ''}`} onClose={() => setCollecting(null)} maxWidth="sm">
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Outstanding</Typography>
              <Typography fontWeight={800} color="error.main">{currency(collecting?.outstanding)}</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Payment is applied to the oldest unpaid bills first.
            </Typography>
          </Paper>

          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth size="small" label="Amount" type="number" autoFocus
                inputProps={{ min: 0, step: 'any' }}
                {...collectFields.fieldProps('amount', form)}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                select fullWidth size="small" label="Method"
                {...collectFields.fieldProps('paymentMethod', form)}
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                InputLabelProps={{ shrink: true }}
              >
                {METHODS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth size="small" label="Reference"
                value={form.referenceNumber}
                onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setCollecting(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button
              variant="contained" sx={{ borderRadius: 2 }}
              disabled={saving || !(Number(form.amount) > 0)}
              onClick={submitCollect}
            >
              {saving ? 'Saving…' : 'Collect'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      {/* Customer statement */}
      <Modal
        open={Boolean(ledger)}
        title={`Statement — ${ledger?.customer?.customerName || ''}`}
        onClose={() => setLedger(null)}
        maxWidth="md"
      >
        {ledger && (
          <Stack spacing={2}>
            <Grid container spacing={1.5}>
              {[
                { label: 'Billed', value: ledger.summary.billed, color: 'text.primary' },
                { label: 'Paid', value: ledger.summary.paid, color: 'success.main' },
                { label: 'Outstanding', value: ledger.summary.outstanding, color: 'error.main' },
              ].map((tile) => (
                <Grid item xs={4} key={tile.label}>
                  <Paper variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">{tile.label}</Typography>
                    <Typography variant="h6" fontWeight={800} color={tile.color}>{currency(tile.value)}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            <Divider />

            <Box sx={{ maxHeight: 340, overflowY: 'auto' }}>
              {ledger.ledger.map((entry, index) => (
                <Stack
                  key={index}
                  direction="row" justifyContent="space-between" alignItems="center"
                  sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {entry.type} · {entry.reference}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {date(entry.date)}
                      {entry.against ? ` · against ${entry.against}` : ''}
                      {entry.dueDate ? ` · due ${date(entry.dueDate)}` : ''}
                    </Typography>
                  </Box>
                  <Stack alignItems="flex-end">
                    <Typography variant="body2" fontWeight={700} color={entry.debit ? 'error.main' : 'success.main'}>
                      {entry.debit ? `+${currency(entry.debit)}` : `−${currency(entry.credit)}`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Balance {currency(entry.balance)}
                    </Typography>
                  </Stack>
                </Stack>
              ))}
              {!ledger.ledger.length && (
                <Typography variant="body2" color="text.secondary">No entries yet.</Typography>
              )}
            </Box>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button startIcon={<PrintIcon />} variant="outlined" onClick={printLedger} sx={{ borderRadius: 2 }}>
                Print Statement
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
