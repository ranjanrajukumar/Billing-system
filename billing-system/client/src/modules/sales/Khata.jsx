import AddIcon from '@mui/icons-material/Add';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteIcon from '@mui/icons-material/Delete';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PrintIcon from '@mui/icons-material/Print';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import {
  alpha, Box, Button, Chip, Divider, Grid, IconButton, Link, MenuItem,
  Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
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
import { useAuth } from '../../context/AuthContext.jsx';
import { printDocument } from '../../utils/print.js';

const blankEntry = {
  partyKey: '', entryType: 'Gave', amount: '', entryDate: new Date().toISOString().slice(0, 10),
  note: '', dueDate: '', attachment: null,
};

export default function Khata() {
  const theme = useTheme();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState({ parties: [], totals: {} });
  const [parties, setParties] = useState({ customers: [], suppliers: [] });
  const [search, setSearch] = useState('');
  const [partyType, setPartyType] = useState('');
  const [userId, setUserId] = useState('');
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [form, setForm] = useState(blankEntry);
  // A ledger line is a type, a date and an amount. Any of the three missing
  // and the running balance below it means nothing.
  const khataFields = useRequiredFields([
    { name: 'entryType', label: 'Entry type' },
    { name: 'entryDate', label: 'Date' },
    { name: 'amount', label: 'Amount', positive: true },
  ]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [summary, partyList] = await Promise.all([
        api.get('/khata/summary', {
          params: { search, partyType: partyType || undefined, userId: userId || undefined },
        }).then((r) => r.data),
        api.get('/khata/parties').then((r) => r.data),
      ]);
      setData(summary);
      setParties(partyList);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load khata', 'error');
      setData({ parties: [], totals: {} });
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [search, partyType, userId]);

  // Only an Admin can look at other people's khata, so only they get the filter.
  useEffect(() => {
    if (user?.role !== 'Admin') return;
    api.get('/users', { params: { limit: 100 } })
      .then((r) => setStaff(r.data?.data || []))
      .catch(() => setStaff([]));
  }, [user?.role]);

  const openLedger = async (row) => {
    try {
      setLedger(await api.get(`/khata/party/${row.partyType}/${row.partyId}`).then((r) => r.data));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load ledger', 'error');
    }
  };

  const refreshLedger = async () => {
    if (!ledger) return;
    const { partyType: t, partyId } = ledger.party;
    setLedger(await api.get(`/khata/party/${t}/${partyId}`).then((r) => r.data));
  };

  const openEntry = (preset = {}) => {
    setForm({ ...blankEntry, ...preset });
    setEntryOpen(true);
  };

  const saveEntry = async () => {
    if (!khataFields.check(form, showToast)) return;

    if (Number(form.amount || 0) <= 0) { showToast('Amount must be positive', 'error'); return; }
    const [type, id] = String(form.partyKey).split(':');
    if (!type || !id) { showToast('Choose a party', 'error'); return; }

    setSaving(true);
    try {
      const body = new FormData();
      body.append('partyType', type);
      body.append('partyId', id);
      body.append('entryType', form.entryType);
      body.append('amount', form.amount);
      body.append('entryDate', form.entryDate);
      if (form.note) body.append('note', form.note);
      if (form.dueDate) body.append('dueDate', form.dueDate);
      if (form.attachment) body.append('attachment', form.attachment);

      await api.post('/khata/entries', body);
      showToast('Entry added');
      setEntryOpen(false);
      await load();
      await refreshLedger();
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to save entry', 'error');
    }
    setSaving(false);
  };

  const deleteEntry = async (id) => {
    try {
      await api.delete(`/khata/entries/${id}`);
      showToast('Entry removed');
      await load();
      await refreshLedger();
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to remove entry', 'error');
    }
  };

  // Bill photos are private now, so they are fetched with the auth header and
  // opened from a blob rather than linked directly.
  const viewBill = async (entry) => {
    try {
      const blob = await api.get(entry.attachmentUrl, { responseType: 'blob' }).then((r) => r.data);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to open the bill', 'error');
    }
  };

  const remind = (party, balance) => {
    const owed = balance > 0;
    const text = owed
      ? `Namaste ${party.partyName}, as per our khata your balance is ${currency(balance)}. Kindly arrange the payment. Thank you.`
      : `Namaste ${party.partyName}, as per our khata we owe you ${currency(Math.abs(balance))}.`;
    const mobile = String(party.mobileNumber || '').replace(/\D/g, '');
    window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const printLedger = () => {
    if (!ledger) return;
    const balance = ledger.summary.balance;
    printDocument({
      title: `Khata — ${ledger.party.partyName}`,
      subtitle: `${balance > 0 ? 'You will get' : 'You will give'} ${currency(Math.abs(balance))}`
        + (ledger.party.mobileNumber ? ` · ${ledger.party.mobileNumber}` : ''),
      columns: [
        { header: 'Date', value: (e) => date(e.entryDate) },
        { header: 'Details', value: (e) => e.note || '—' },
        { header: 'You Gave', value: (e) => (e.entryType === 'Gave' ? currency(e.amount) : ''), numeric: true },
        { header: 'You Got', value: (e) => (e.entryType === 'Got' ? currency(e.amount) : ''), numeric: true },
        { header: 'Balance', value: (e) => currency(e.balance), numeric: true },
      ],
      rows: ledger.ledger,
      summary: [
        { label: 'Total you gave', value: currency(ledger.summary.gave) },
        { label: 'Total you got', value: currency(ledger.summary.got) },
        { label: balance > 0 ? 'You will get' : 'You will give', value: currency(Math.abs(balance)), total: true },
      ],
    });
  };

  const partyOptions = [
    ...parties.customers.map((p) => ({ ...p, key: `Customer:${p.partyId}` })),
    ...parties.suppliers.map((p) => ({ ...p, key: `Supplier:${p.partyId}` })),
  ];

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Khata Book"
        subtitle="A standalone gave/got ledger for customers and suppliers — kept separate from invoices"
        icon={<MenuBookIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <SearchBox value={search} onChange={setSearch} placeholder="Search parties…" />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => openEntry()}>
              Add Entry
            </Button>
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <StatsCard title="You Will Get" value={currency(data.totals?.youWillGet)} detail="Owed to you" icon={<MenuBookIcon />} gradient="success" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="You Will Give" value={currency(data.totals?.youWillGive)} detail="You owe" icon={<MenuBookIcon />} gradient="error" />
        </Grid>
        <Grid item xs={6} sm={4}>
          <StatsCard title="Parties" value={data.totals?.parties || 0} detail="With a balance" icon={<MenuBookIcon />} gradient="primary" />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="body2" color="text.secondary">Show</Typography>
          <ToggleButtonGroup
            size="small" exclusive value={partyType}
            onChange={(_e, next) => setPartyType(next ?? '')}
          >
            <ToggleButton value="">All</ToggleButton>
            <ToggleButton value="Customer">Customers</ToggleButton>
            <ToggleButton value="Supplier">Suppliers</ToggleButton>
          </ToggleButtonGroup>
          {user?.role === 'Admin' && (
            <TextField
              select size="small" label="Recorded by" value={userId}
              onChange={(e) => setUserId(e.target.value)}
              sx={{ minWidth: 180 }} InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">Everyone</MenuItem>
              {staff.map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
            </TextField>
          )}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {user?.role === 'Admin'
              ? 'Manual ledger — excludes invoices and purchases. You can see every user’s khata.'
              : 'Manual ledger — excludes invoices and purchases. You see only the entries you recorded.'}
          </Typography>
        </Stack>
      </Paper>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="partyName"
          rows={data.parties}
          columns={[
            { field: 'partyName', headerName: 'Party', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.partyName}</Typography>
                <Typography variant="caption" color="text.secondary">{r.mobileNumber}</Typography>
              </Box>
            )},
            { field: 'partyType', headerName: 'Type', render: (r) => (
              <Chip label={r.partyType} size="small" variant="outlined" color={r.partyType === 'Customer' ? 'primary' : 'secondary'} sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
            )},
            { field: 'entries', headerName: 'Entries' },
            { field: 'lastEntry', headerName: 'Last Entry', render: (r) => (r.lastEntry ? date(r.lastEntry) : '—') },
            { field: 'balance', headerName: 'Balance', render: (r) => (
              <Stack alignItems="flex-start">
                <Typography fontWeight={800} color={r.balance > 0 ? 'success.main' : 'error.main'}>
                  {currency(Math.abs(r.balance))}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.balance > 0 ? 'You will get' : 'You will give'}
                </Typography>
              </Stack>
            )},
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.25}>
                <Tooltip title="Open khata">
                  <IconButton size="small" color="primary" onClick={() => openLedger(r)} sx={{ borderRadius: 1.5 }}>
                    <MenuBookIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Add entry">
                  <IconButton size="small" onClick={() => openEntry({ partyKey: `${r.partyType}:${r.partyId}` })} sx={{ borderRadius: 1.5 }}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Send reminder">
                  <IconButton size="small" onClick={() => remind(r, r.balance)} sx={{ borderRadius: 1.5, color: '#25D366' }}>
                    <WhatsAppIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )},
          ]}
        />
      )}

      {/* Add entry */}
      <Modal open={entryOpen} title="Add Khata Entry" onClose={() => setEntryOpen(false)} maxWidth="sm">
        <Stack spacing={2}>
          <TextField
            select fullWidth size="small" label="Party"
            value={form.partyKey}
            onChange={(e) => setForm({ ...form, partyKey: e.target.value })}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value=""><em>Select a customer or supplier</em></MenuItem>
            {partyOptions.map((p) => (
              <MenuItem key={p.key} value={p.key}>{p.partyName} · {p.partyType}</MenuItem>
            ))}
          </TextField>

          <ToggleButtonGroup
            fullWidth exclusive size="small"
            {...khataFields.fieldProps('entryType', form)}
            value={form.entryType}
            onChange={(_e, next) => next && setForm({ ...form, entryType: next })}
          >
            <ToggleButton value="Gave" sx={{ fontWeight: 700, '&.Mui-selected': { bgcolor: alpha(theme.palette.error.main, 0.12), color: 'error.main' } }}>
              You Gave
            </ToggleButton>
            <ToggleButton value="Got" sx={{ fontWeight: 700, '&.Mui-selected': { bgcolor: alpha(theme.palette.success.main, 0.12), color: 'success.main' } }}>
              You Got
            </ToggleButton>
          </ToggleButtonGroup>

          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Amount" type="number" autoFocus
                inputProps={{ min: 0, step: 'any' }}
                {...khataFields.fieldProps('amount', form)}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Date" type="date"
                {...khataFields.fieldProps('entryDate', form)}
                value={form.entryDate}
                onChange={(e) => setForm({ ...form, entryDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Due date (optional)" type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Button
                fullWidth component="label" variant="outlined"
                startIcon={<AttachFileIcon />} sx={{ borderRadius: 2, height: 40 }}
              >
                {form.attachment ? 'Photo attached' : 'Attach bill'}
                <input
                  hidden type="file" accept="image/*"
                  onChange={(e) => setForm({ ...form, attachment: e.target.files?.[0] || null })}
                />
              </Button>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth size="small" label="Note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setEntryOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button
              variant="contained" sx={{ borderRadius: 2 }}
              disabled={saving || !(Number(form.amount) > 0) || !form.partyKey}
              onClick={saveEntry}
            >
              {saving ? 'Saving…' : 'Save Entry'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      {/* Party ledger */}
      <Modal
        open={Boolean(ledger)}
        title={`Khata — ${ledger?.party?.partyName || ''}`}
        onClose={() => setLedger(null)}
        maxWidth="md"
      >
        {ledger && (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{
              borderRadius: 2, p: 2,
              bgcolor: alpha(ledger.summary.balance > 0 ? theme.palette.success.main : theme.palette.error.main, 0.06),
            }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {ledger.summary.balance > 0 ? 'You will get' : 'You will give'}
                  </Typography>
                  <Typography variant="h5" fontWeight={800} color={ledger.summary.balance > 0 ? 'success.main' : 'error.main'}>
                    {currency(Math.abs(ledger.summary.balance))}
                  </Typography>
                </Box>
                <Stack alignItems="flex-end">
                  <Typography variant="caption" color="text.secondary">
                    Gave {currency(ledger.summary.gave)} · Got {currency(ledger.summary.got)}
                  </Typography>
                  {ledger.summary.overdue && (
                    <Chip label="Overdue" size="small" color="error" sx={{ mt: 0.5, fontWeight: 700 }} />
                  )}
                </Stack>
              </Stack>
            </Paper>

            <Divider />

            <Box sx={{ maxHeight: 340, overflowY: 'auto' }}>
              {ledger.ledger.map((entry) => (
                <Stack
                  key={entry.id}
                  direction="row" justifyContent="space-between" alignItems="center"
                  sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{entry.note || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {date(entry.entryDate)}
                      {entry.dueDate ? ` · due ${date(entry.dueDate)}` : ''}
                    </Typography>
                    {entry.attachmentUrl && (
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        <Link component="button" type="button" onClick={() => viewBill(entry)}>View bill</Link>
                      </Typography>
                    )}
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Stack alignItems="flex-end">
                      <Typography variant="body2" fontWeight={700} color={entry.entryType === 'Gave' ? 'error.main' : 'success.main'}>
                        {entry.entryType === 'Gave' ? '+' : '−'}{currency(entry.amount)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Balance {currency(entry.balance)}
                      </Typography>
                    </Stack>
                    <Tooltip title="Delete entry">
                      <IconButton size="small" color="error" onClick={() => deleteEntry(entry.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              ))}
              {!ledger.ledger.length && (
                <Typography variant="body2" color="text.secondary">No entries yet.</Typography>
              )}
            </Box>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                startIcon={<WhatsAppIcon />} variant="outlined" sx={{ borderRadius: 2, color: '#25D366', borderColor: '#25D366' }}
                onClick={() => remind(ledger.party, ledger.summary.balance)}
              >
                Remind
              </Button>
              <Button startIcon={<PrintIcon />} variant="outlined" onClick={printLedger} sx={{ borderRadius: 2 }}>
                Print
              </Button>
              <Button
                startIcon={<AddIcon />} variant="contained" sx={{ borderRadius: 2 }}
                onClick={() => openEntry({ partyKey: `${ledger.party.partyType}:${ledger.party.partyId}` })}
              >
                Add Entry
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
