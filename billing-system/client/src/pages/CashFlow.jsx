import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import {
  Alert, Box, Grid, LinearProgress, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Loader from '../components/Loader.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { currency, date as fmtDate } from '../utils/formatters.js';
import { cashFlowApi } from '../services/resource.service.js';

/**
 * Cash flow — money that actually moved.
 *
 * Deliberately not the profit figure: a credit sale shows up here when the
 * customer pays, not when the bill was raised. A shop can be profitable on
 * paper and still unable to pay for stock, and that gap is exactly what this
 * screen exists to show.
 */
export default function CashFlow() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  });
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      setData(await cashFlowApi.overview({ from: range.from, to: range.to }));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load cash flow', 'error');
      setData(null);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [range.from, range.to]);

  const biggest = Math.max(
    ...(data ? [...data.inflow, ...data.outflow].map((r) => r.amount) : [0]), 1,
  );

  const FlowTable = ({ title, rows, tone }) => (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', height: '100%' }}>
      <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover' }}>
        <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
      </Box>
      <Table size="small">
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.source} hover>
              <TableCell sx={{ width: '55%' }}>
                <Typography variant="body2">{row.source}</Typography>
                <LinearProgress
                  variant="determinate"
                  value={(row.amount / biggest) * 100}
                  color={tone}
                  sx={{ height: 4, borderRadius: 2, mt: 0.5 }}
                />
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={700}>{currency(row.amount)}</Typography>
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow><TableCell colSpan={2}>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                Nothing in this period.
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
        title="Cash Flow"
        subtitle="What actually came in and went out — money moved, not profit earned"
        icon={<AccountBalanceWalletIcon />}
      />

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
        <Grid container spacing={1.5}>
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

      {loading ? <Loader /> : data && (
        <>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Money in" value={currency(data.totalIn)} detail="Received in the period"
                icon={<TrendingUpIcon />} gradient="success" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Money out" value={currency(data.totalOut)} detail="Paid in the period"
                icon={<TrendingDownIcon />} gradient="danger" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Net flow" value={currency(data.netFlow)}
                detail={Number(data.netFlow) >= 0 ? 'More came in than went out' : 'More went out than came in'}
                icon={<AccountBalanceWalletIcon />}
                gradient={Number(data.netFlow) >= 0 ? 'primary' : 'warning'} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Held now" value={currency(data.position?.total)}
                detail={`${currency(data.position?.cashOnHand)} cash · ${currency(data.position?.inBank)} bank`}
                icon={<AccountBalanceWalletIcon />} gradient="info" />
            </Grid>
          </Grid>

          {Number(data.netFlow) < 0 && (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              More money left the business than came into it over this period. That is not the same as a loss —
              stock bought now is sold later — but it is what drains the bank.
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}><FlowTable title="Where money came from" rows={data.inflow} tone="success" /></Grid>
            <Grid item xs={12} md={6}><FlowTable title="Where money went" rows={data.outflow} tone="error" /></Grid>
          </Grid>

          {/* Where the money is sitting right now. */}
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" fontWeight={700}>Where the money is now</Typography>
            </Box>
            <Table size="small">
              <TableBody>
                {(data.position?.tills || []).map((till) => (
                  <TableRow key={`till-${till.registerId}`} hover>
                    <TableCell>Cash — {till.registerName}</TableCell>
                    <TableCell align="right"><strong>{currency(till.balance)}</strong></TableCell>
                  </TableRow>
                ))}
                {(data.position?.banks || []).map((bank) => (
                  <TableRow key={`bank-${bank.id}`} hover>
                    <TableCell>{bank.accountName}{bank.bankName ? ` — ${bank.bankName}` : ''}</TableCell>
                    <TableCell align="right"><strong>{currency(bank.balance)}</strong></TableCell>
                  </TableRow>
                ))}
                {!(data.position?.tills || []).length && !(data.position?.banks || []).length && (
                  <TableRow><TableCell colSpan={2}>
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                      No open till and no bank account yet.
                    </Typography>
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          {/* Day by day, so an odd day is easy to find. */}
          {(data.daily || []).length > 0 && (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover' }}>
                <Typography variant="subtitle2" fontWeight={700}>Day by day</Typography>
              </Box>
              <Box sx={{ overflowX: 'auto', maxHeight: 320 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Cash in</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Cash out</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Bank in</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Bank out</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Net</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.daily.map((day) => (
                      <TableRow key={day.day} hover>
                        <TableCell>{fmtDate(day.day)}</TableCell>
                        <TableCell align="right">{day.cashIn ? currency(day.cashIn) : '—'}</TableCell>
                        <TableCell align="right">{day.cashOut ? currency(day.cashOut) : '—'}</TableCell>
                        <TableCell align="right">{day.bankIn ? currency(day.bankIn) : '—'}</TableCell>
                        <TableCell align="right">{day.bankOut ? currency(day.bankOut) : '—'}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700}
                            color={day.net >= 0 ? 'success.main' : 'error.main'}>
                            {currency(day.net)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
