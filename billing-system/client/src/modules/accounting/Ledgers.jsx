import MenuBookIcon from '@mui/icons-material/MenuBook';
import {
  Box, Button, Grid, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { currency, date as fmtDate } from '../../utils/formatters.js';
import { customersApi, ledgersApi, suppliersApi } from '../../services/resource.service.js';

/**
 * Running party ledgers.
 *
 * Every line is assembled from the documents themselves rather than from a
 * stored balance, so what you see here cannot drift away from the invoices it
 * describes. Debit increases what the party owes; credit reduces it.
 */
export default function Ledgers() {
  const [tab, setTab] = useState(0);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [partyId, setPartyId] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [ledger, setLedger] = useState(null);
  const [outstanding, setOutstanding] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const isCustomer = tab === 0;

  const loadParties = async () => {
    setLoading(true);
    try {
      const [cust, sup] = await Promise.all([
        customersApi.list({ limit: 500 }),
        suppliersApi.list({ limit: 500 }),
      ]);
      setCustomers(cust?.data || []);
      setSuppliers(sup?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load parties', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { loadParties(); }, []);

  const loadOutstanding = async () => {
    try {
      setOutstanding(isCustomer ? await ledgersApi.receivables() : await ledgersApi.payables());
    } catch {
      setOutstanding({ rows: [], total: 0 });
    }
  };
  useEffect(() => { loadOutstanding(); setLedger(null); setPartyId(''); }, [tab]);

  const openLedger = async (id) => {
    if (!id) { setLedger(null); return; }
    setPartyId(id);
    try {
      const params = { from: range.from || undefined, to: range.to || undefined };
      setLedger(isCustomer
        ? await ledgersApi.customer(id, params)
        : await ledgersApi.supplier(id, params));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not load that ledger', 'error');
    }
  };

  const parties = isCustomer ? customers : suppliers;
  const nameKey = isCustomer ? 'customerName' : 'supplierName';

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Party Ledgers"
        subtitle="Running accounts for customers and suppliers, built from the documents themselves"
        icon={<MenuBookIcon />}
      />

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab label="Customers (Receivable)" />
          <Tab label="Suppliers (Payable)" />
        </Tabs>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={6} sm={6}>
          <StatsCard
            title={isCustomer ? 'Total receivable' : 'Total payable'}
            value={currency(outstanding.total)}
            detail={isCustomer ? 'Owed to us' : 'Owed by us'}
            icon={<MenuBookIcon />}
            gradient={isCustomer ? 'success' : 'warning'}
          />
        </Grid>
        <Grid item xs={6} sm={6}>
          <StatsCard
            title="Parties with a balance"
            value={outstanding.rows.length}
            detail="Accounts not settled"
            icon={<MenuBookIcon />}
            gradient="primary"
          />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={5}>
            <TextField
              select fullWidth size="small" label={isCustomer ? 'Customer' : 'Supplier'}
              value={partyId} onChange={(e) => openLedger(e.target.value)}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value=""><em>Choose a party</em></MenuItem>
              {parties.map((p) => <MenuItem key={p.id} value={p.id}>{p[nameKey]}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              fullWidth size="small" type="date" label="From" value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              fullWidth size="small" type="date" label="To" value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={1}>
            <Button fullWidth variant="outlined" disabled={!partyId} onClick={() => openLedger(partyId)} sx={{ borderRadius: 2 }}>
              Go
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {ledger ? (
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Opening" value={currency(ledger.openingBalance)} detail="Brought forward" icon={<MenuBookIcon />} gradient="info" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Total debit" value={currency(ledger.totalDebit)} detail="Charged" icon={<MenuBookIcon />} gradient="primary" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Total credit" value={currency(ledger.totalCredit)} detail="Settled" icon={<MenuBookIcon />} gradient="success" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatsCard
                title="Outstanding" value={currency(ledger.outstanding)}
                detail={isCustomer ? 'Owed to us' : 'Owed by us'}
                icon={<MenuBookIcon />} gradient={Number(ledger.outstanding) > 0 ? 'warning' : 'success'}
              />
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Typography fontWeight={700}>{ledger.party.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {[ledger.party.mobile, ledger.party.gstNumber].filter(Boolean).join(' · ') || '—'}
              </Typography>
            </Box>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Particular</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Debit</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Credit</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell>—</TableCell>
                    <TableCell><em>Opening balance</em></TableCell>
                    <TableCell align="right">—</TableCell>
                    <TableCell align="right">—</TableCell>
                    <TableCell align="right"><strong>{currency(ledger.openingBalance)}</strong></TableCell>
                  </TableRow>
                  {ledger.rows.map((row, i) => (
                    <TableRow key={`${row.voucherType}-${row.voucherId}-${i}`} hover>
                      <TableCell>{fmtDate(row.date)}</TableCell>
                      <TableCell>{row.particular}</TableCell>
                      <TableCell align="right">{row.debit ? currency(row.debit) : '—'}</TableCell>
                      <TableCell align="right">{row.credit ? currency(row.credit) : '—'}</TableCell>
                      <TableCell align="right"><strong>{currency(row.balance)}</strong></TableCell>
                    </TableRow>
                  ))}
                  {!ledger.rows.length && (
                    <TableRow><TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                        No transactions in this period.
                      </Typography>
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </Stack>
      ) : loading ? <Loader /> : (
        <Stack spacing={1}>
          <Typography variant="subtitle2" fontWeight={700}>
            {isCustomer ? 'Customers who owe us' : 'Suppliers we owe'}
          </Typography>
          <DataTable
            mobileKeyField={isCustomer ? 'customerName' : 'supplierName'}
            rows={outstanding.rows}
            columns={[
              { field: 'name', headerName: 'Party', render: (r) => (
                <Box>
                  <Typography fontWeight={700} variant="body2">{r.customerName || r.supplierName}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.mobile || '—'}</Typography>
                </Box>
              )},
              { field: 'count', headerName: 'Documents', render: (r) => r.invoiceCount ?? r.purchaseCount ?? 0 },
              { field: 'oldestDate', headerName: 'Oldest', render: (r) => fmtDate(r.oldestDate) },
              { field: 'outstanding', headerName: 'Outstanding', render: (r) => (
                <Typography fontWeight={700} color="warning.main">{currency(r.outstanding)}</Typography>
              )},
              { field: 'actions', headerName: '', render: (r) => (
                <Button size="small" onClick={() => openLedger(r.customerId || r.supplierId)}>Open ledger</Button>
              )},
            ]}
          />
        </Stack>
      )}
    </Stack>
  );
}
