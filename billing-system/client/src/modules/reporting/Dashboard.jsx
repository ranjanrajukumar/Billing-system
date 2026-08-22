import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import InsightsIcon from '@mui/icons-material/Insights';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  alpha, Box, Button, Chip, Grid, LinearProgress, Paper, Stack, Tab, Tabs,
  Typography, useTheme,
} from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataGrid } from '@mui/x-data-grid';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import ExpiryAlerts from '../inventory/ExpiryAlerts.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import ProductPerformance from './ProductPerformance.jsx';
import PeriodFilter from '../../components/PeriodFilter.jsx';
import {
  AgeingTile, AreaPanel, Band, SectionLabel, TodayTile,
} from './SummaryBands.jsx';
import { dashboardApi } from '../../services/resource.service.js';
import { currency, date } from '../../utils/formatters.js';
import { useFetch } from '../../hooks/useFetch.js';

/**
 * The operations summary.
 *
 * Read in three passes, which is why it is drawn in three bands rather than as
 * one grid of cards: what has happened today, what is waiting and how long it
 * has waited, and where each area stands. Somebody opening this at the start of
 * a shift wants the middle band; somebody reporting on the week wants the tabs.
 *
 * The tabs exist because the two audiences want different things and neither
 * should have to scroll past the other's. Summary is the shift view and stays
 * first; the charts and tables that were previously stacked down one long page
 * are behind the tab for the area they belong to.
 */

function statusChip(row) {
  const status = row.paymentMethod === 'Credit' ? 'Pending' : 'Paid';
  return (
    <Chip
      label={status}
      size="small"
      color={status === 'Paid' ? 'success' : 'warning'}
      variant="filled"
      sx={{ fontWeight: 700, fontSize: '0.7rem' }}
    />
  );
}

const TABS = [
  { key: 'summary', label: 'Summary', icon: <InsightsIcon fontSize="small" /> },
  { key: 'sales', label: 'Sales', icon: <ReceiptLongIcon fontSize="small" /> },
  { key: 'inventory', label: 'Inventory', icon: <Inventory2Icon fontSize="small" /> },
  { key: 'purchasing', label: 'Purchasing', icon: <ShoppingCartIcon fontSize="small" /> },
];

export default function Dashboard() {
  const [period, setPeriod] = useState({ period: 'thisMonth', from: '', to: '', month: '' });
  const [tab, setTab] = useState('summary');
  const theme = useTheme();
  const navigate = useNavigate();

  const { data, loading, refreshing, error } = useFetch(() => dashboardApi.get(period), [period]);
  // The bands do not depend on the period control — they are today's position,
  // and a "last quarter" filter must not quietly rewrite what is pending now.
  const ops = useFetch(() => dashboardApi.operations(), []);

  if (loading) return <Loader rows={6} />;
  if (error) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography color="error" variant="h6">Failed to load dashboard</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{error}</Typography>
      </Box>
    );
  }
  if (!data) return null;

  const chart = data?.charts?.sales || [];
  const summary = ops.data;

  const formatToday = (metric) => (
    metric.money ? currency(metric.value) : metric.value.toLocaleString()
  );

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Operations Summary"
        subtitle="Live operational data"
        icon={<InsightsIcon />}
      />

      <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Tabs
          value={tab}
          onChange={(_event, next) => setTab(next)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 44, '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 600 } }}
        >
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} icon={t.icon} iconPosition="start" />
          ))}
        </Tabs>
      </Box>

      {tab === 'summary' && (
        <Stack spacing={3}>
          {/* Seed lots past or near their sowing validity. Kept at the top of
              the shift view because it is the one thing here with a deadline. */}
          <ExpiryAlerts />

          {ops.loading ? <Loader rows={3} /> : !summary ? (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {ops.error || 'The operations summary is unavailable.'}
              </Typography>
            </Paper>
          ) : (
            <>
              <Box>
                <SectionLabel sx={{ mb: 1.25 }}>Today</SectionLabel>
                <Band>
                  {summary.today.map((metric) => (
                    <TodayTile key={metric.key} metric={metric} format={formatToday} />
                  ))}
                </Band>
              </Box>

              <Box>
                <SectionLabel sx={{ mb: 1.25 }}>Pending &amp; Ageing</SectionLabel>
                <Band>
                  {summary.pending.map((metric) => (
                    <AgeingTile key={metric.key} metric={metric} />
                  ))}
                </Band>
              </Box>

              <Grid container spacing={2}>
                {['sales', 'inventory', 'purchasing'].map((key) => (
                  <Grid item xs={12} md={4} key={key}>
                    <AreaPanel area={summary.areas[key]} />
                  </Grid>
                ))}
              </Grid>
            </>
          )}
        </Stack>
      )}

      {tab === 'sales' && (
        <Stack spacing={3}>
          <Paper
            variant="outlined"
            sx={{ borderRadius: 2, p: 2.5, position: 'relative', overflow: 'hidden' }}
          >
            {/* Changing the period reloads only this card. A thin bar along the
                top says so without the chart jumping or the page blanking. */}
            {refreshing && (
              <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 }} />
            )}
            <Stack
              direction={{ xs: 'column', sm: 'row' }} spacing={1}
              justifyContent="space-between" alignItems={{ sm: 'center' }} mb={2}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Revenue Trend</Typography>
                <Typography variant="caption" color="text.secondary">
                  {/* Say what is actually plotted rather than a fixed claim. */}
                  {data.period?.from || data.period?.to
                    ? `${data.period.from || 'the beginning'} to ${data.period.to || 'today'}`
                    : 'All recorded sales'}
                </Typography>
              </Box>
              <PeriodFilter
                disableContainer
                value={period}
                onChange={(next) => setPeriod({ ...period, ...next })}
              />
            </Stack>
            {chart.length > 0 ? (
              // Dimmed rather than removed, so the axes hold their place.
              <Box sx={{ opacity: refreshing ? 0.55 : 1, transition: 'opacity 0.15s' }}>
                <LineChart
                  height={260}
                  dataset={chart}
                  xAxis={[{ dataKey: 'date', scaleType: 'point' }]}
                  series={[{
                    dataKey: 'total',
                    label: 'Sales (₹)',
                    color: theme.palette.primary.main,
                    area: true,
                    showMark: false,
                  }]}
                  sx={{
                    '& .MuiAreaElement-root': { fill: alpha(theme.palette.primary.main, 0.12) },
                    '& .MuiLineElement-root': { strokeWidth: 2.5 },
                  }}
                />
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
                <TrendingUpIcon sx={{ fontSize: 40, opacity: 0.3 }} />
                <Typography variant="body2" sx={{ mt: 1 }}>No sales data yet</Typography>
              </Box>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Recent Invoices</Typography>
                <Typography variant="caption" color="text.secondary">Latest billing activity</Typography>
              </Box>
              <Button
                size="small"
                endIcon={<ArrowForwardIcon fontSize="small" />}
                onClick={() => navigate('/invoices')}
              >
                All Invoices
              </Button>
            </Stack>
            <DataTable
              columns={[
                { field: 'invoiceNumber', headerName: 'Invoice #' },
                { field: 'invoiceDate', headerName: 'Date', render: (row) => date(row.invoiceDate) },
                { field: 'customer', headerName: 'Customer', render: (row) => row.Customer?.customerName },
                { field: 'paymentMethod', headerName: 'Payment' },
                { field: 'status', headerName: 'Status', render: statusChip },
                { field: 'grandTotal', headerName: 'Amount', render: (row) => (
                  <Typography fontWeight={700} color="primary.main">{currency(row.grandTotal)}</Typography>
                )},
              ]}
              rows={data.recentInvoices ?? []}
            />
          </Paper>
        </Stack>
      )}

      {tab === 'inventory' && (
        <Stack spacing={3}>
          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  sx={{
                    width: 32, height: 32, borderRadius: 1.5,
                    bgcolor: alpha(theme.palette.warning.main, 0.12),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'warning.main',
                  }}
                >
                  <WarningAmberIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="subtitle2">Low Stock</Typography>
                  <Typography variant="caption" color="text.secondary">Needs reorder</Typography>
                </Box>
              </Stack>
              <Button
                size="small"
                endIcon={<ArrowForwardIcon fontSize="small" />}
                onClick={() => navigate('/inventory')}
                sx={{ fontSize: '0.75rem' }}
              >
                View All
              </Button>
            </Stack>
            {data.lowStockProducts?.length > 0 ? (
              <Box sx={{ height: 300, width: '100%' }}>
                <DataGrid
                  rows={data.lowStockProducts}
                  columns={[
                    { field: 'productName', headerName: 'Product', flex: 1, renderCell: (params) => (
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>{params.value}</Typography>
                    )},
                    { field: 'stock', headerName: 'Stock', width: 90, renderCell: (params) => (
                      <Chip
                        label={`${params.value} left`}
                        size="small"
                        color={params.value <= 0 ? 'error' : 'warning'}
                        variant="filled"
                        sx={{ fontSize: '0.7rem', fontWeight: 700 }}
                      />
                    )},
                  ]}
                  hideFooter
                  disableColumnMenu
                  disableRowSelectionOnClick
                />
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                <Typography variant="body2">All products stocked 🎉</Typography>
              </Box>
            )}
          </Paper>

          {/* Best and worst sellers, by month or year */}
          <ProductPerformance />
        </Stack>
      )}

      {tab === 'purchasing' && (
        <Stack spacing={3}>
          {ops.loading ? <Loader rows={3} /> : summary ? (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <AreaPanel area={summary.areas.purchasing} />
              </Grid>
              <Grid item xs={12} md={6}>
                <AreaPanel area={summary.areas.inventory} />
              </Grid>
            </Grid>
          ) : (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {ops.error || 'The operations summary is unavailable.'}
              </Typography>
            </Paper>
          )}

          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle2">Procure to Stock</Typography>
                <Typography variant="caption" color="text.secondary">
                  The whole chain, stage by stage
                </Typography>
              </Box>
              <Button
                size="small"
                endIcon={<ArrowForwardIcon fontSize="small" />}
                onClick={() => navigate('/process/procure-to-stock')}
              >
                Open
              </Button>
            </Stack>
          </Paper>
        </Stack>
      )}
    </Stack>
  );
}
