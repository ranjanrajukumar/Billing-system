import AssessmentIcon from '@mui/icons-material/Assessment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import {
  Alert, Box, Grid, Paper, Stack, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Loader from '../components/Loader.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { currency } from '../utils/formatters.js';
import { accountingApi } from '../services/resource.service.js';

/**
 * Trial balance, profit & loss and balance sheet.
 *
 * All three are derived from the posted journal lines rather than from stored
 * totals, so they cannot disagree with the journal — and the "balanced" badge
 * is a real check, not decoration: if it ever shows a mismatch, something
 * posted badly and the number is telling you so.
 */
export default function Financials() {
  const [tab, setTab] = useState(0);
  const [range, setRange] = useState({
    from: `${new Date().getFullYear()}-04-01`,
    to: new Date().toISOString().slice(0, 10),
  });
  const [tb, setTb] = useState(null);
  const [pl, setPl] = useState(null);
  const [bs, setBs] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const params = { from: range.from || undefined, to: range.to || undefined };
      const [t, p, b] = await Promise.all([
        accountingApi.trialBalance(params),
        accountingApi.profitAndLoss(params),
        accountingApi.balanceSheet({ asOn: range.to || undefined }),
      ]);
      setTb(t); setPl(p); setBs(b);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load the statements', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [range.from, range.to]);

  const BalanceBadge = ({ balanced }) => (
    <Alert
      severity={balanced ? 'success' : 'error'}
      icon={balanced ? <CheckCircleIcon /> : <WarningIcon />}
      sx={{ borderRadius: 2 }}
    >
      {balanced
        ? 'Debits and credits agree.'
        : 'This does not balance. Something has posted incorrectly — check the journal.'}
    </Alert>
  );

  const Section = ({ title, rows, valueKey = 'balance' }) => (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover' }}>
        <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
      </Box>
      <Table size="small">
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.accountId} hover>
              <TableCell>
                <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', color: 'text.secondary', mr: 1 }}>
                  {row.code}
                </Typography>
                {row.name}
              </TableCell>
              <TableCell align="right"><strong>{currency(row[valueKey])}</strong></TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow><TableCell colSpan={2}>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                Nothing posted here in this period.
              </Typography>
            </TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  );

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Financial Statements"
        subtitle="Trial balance, profit & loss and balance sheet — all derived from the journal"
        icon={<AssessmentIcon />}
      />

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={6} sm={3}>
            <TextField fullWidth size="small" type="date" label="From" value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField fullWidth size="small" type="date" label="To" value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })} InputLabelProps={{ shrink: true }} />
          </Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab label="Trial Balance" />
          <Tab label="Profit & Loss" />
          <Tab label="Balance Sheet" />
        </Tabs>
      </Paper>

      {loading ? <Loader /> : (
        <>
          {tab === 0 && tb && (
            <Stack spacing={2}>
              <BalanceBadge balanced={tb.balanced} />
              <Grid container spacing={2}>
                <Grid item xs={6}><StatsCard title="Total debits" value={currency(tb.totalDebit)} detail="Debit balances" icon={<AssessmentIcon />} gradient="primary" /></Grid>
                <Grid item xs={6}><StatsCard title="Total credits" value={currency(tb.totalCredit)} detail="Credit balances" icon={<AssessmentIcon />} gradient="info" /></Grid>
              </Grid>
              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Account</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Debit</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Credit</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tb.rows.map((row) => (
                        <TableRow key={row.accountId} hover>
                          <TableCell>
                            <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', color: 'text.secondary', mr: 1 }}>
                              {row.code}
                            </Typography>
                            {row.name}
                          </TableCell>
                          <TableCell>{row.accountType}</TableCell>
                          <TableCell align="right">{row.debitBalance ? currency(row.debitBalance) : '—'}</TableCell>
                          <TableCell align="right">{row.creditBalance ? currency(row.creditBalance) : '—'}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell colSpan={2}><strong>Totals</strong></TableCell>
                        <TableCell align="right"><strong>{currency(tb.totalDebit)}</strong></TableCell>
                        <TableCell align="right"><strong>{currency(tb.totalCredit)}</strong></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Box>
              </Paper>
            </Stack>
          )}

          {tab === 1 && pl && (
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}><StatsCard title="Revenue" value={currency(pl.totalIncome)} detail="Income earned" icon={<AssessmentIcon />} gradient="success" /></Grid>
                <Grid item xs={6} sm={3}><StatsCard title="Cost of goods" value={currency(pl.costOfGoodsSold)} detail="Stock sold" icon={<AssessmentIcon />} gradient="warning" /></Grid>
                <Grid item xs={6} sm={3}><StatsCard title="Gross profit" value={currency(pl.grossProfit)} detail="Revenue less COGS" icon={<AssessmentIcon />} gradient="info" /></Grid>
                <Grid item xs={6} sm={3}>
                  <StatsCard title="Net profit" value={currency(pl.netProfit)} detail="After all expenses"
                    icon={<AssessmentIcon />} gradient={Number(pl.netProfit) >= 0 ? 'primary' : 'danger'} />
                </Grid>
              </Grid>
              <Section title="Income" rows={pl.income.map((r) => ({ ...r, balance: r.periodCredit - r.periodDebit }))} />
              <Section title="Expenses" rows={pl.expense.map((r) => ({ ...r, balance: r.periodDebit - r.periodCredit }))} />
            </Stack>
          )}

          {tab === 2 && bs && (
            <Stack spacing={2}>
              <BalanceBadge balanced={bs.balanced} />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}><StatsCard title="Total assets" value={currency(bs.totalAssets)} detail={`As on ${bs.asOn}`} icon={<AssessmentIcon />} gradient="primary" /></Grid>
                <Grid item xs={6} sm={4}><StatsCard title="Liabilities" value={currency(bs.totalLiabilities)} detail="What we owe" icon={<AssessmentIcon />} gradient="warning" /></Grid>
                <Grid item xs={6} sm={4}><StatsCard title="Equity" value={currency(bs.totalEquity)} detail="Including retained earnings" icon={<AssessmentIcon />} gradient="success" /></Grid>
              </Grid>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}><Section title="Assets" rows={bs.assets} /></Grid>
                <Grid item xs={12} md={6}>
                  <Stack spacing={2}>
                    <Section title="Liabilities" rows={bs.liabilities} />
                    <Section title="Equity" rows={[
                      ...bs.equity,
                      { accountId: 'retained', code: '—', name: 'Retained earnings (this period)', balance: bs.retainedEarnings },
                    ]} />
                  </Stack>
                </Grid>
              </Grid>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
