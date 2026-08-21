import Inventory2Icon from '@mui/icons-material/Inventory2';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { alpha, Box, Button, Chip, Grid, LinearProgress, Paper, Stack, Typography, useTheme } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataGrid } from '@mui/x-data-grid';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import ExpiryAlerts from '../components/ExpiryAlerts.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ProductPerformance from '../components/ProductPerformance.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { dashboardApi } from '../services/resource.service.js';
import { currency, date } from '../utils/formatters.js';
import { useFetch } from '../hooks/useFetch.js';
import PeriodFilter from '../components/PeriodFilter.jsx';

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

export default function Dashboard() {
  const [period, setPeriod] = useState({ period: 'thisMonth', from: '', to: '' , month: '' });
  const { data, loading, refreshing, error } = useFetch(() => dashboardApi.get(period), [period]);
  const theme = useTheme();
  const navigate = useNavigate();

  if (loading) return <Loader rows={6} />;
  if (error) return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Typography color="error" variant="h6">Failed to load dashboard</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{error}</Typography>
    </Box>
  );
  if (!data) return null;

  const chart = data?.charts?.sales || [];

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back! Here's what's happening today."
      />

      {/* Seed lots past or near their sowing validity */}
      <ExpiryAlerts />

      {/* KPI Cards */}
      <Grid container spacing={2} className="stagger-children">
        <Grid item xs={6} sm={6} lg={3}>
          <StatsCard
            title="Total Customers"
            value={data.totalCustomers ?? 0}
            detail="Registered accounts"
            icon={<PeopleIcon />}
            gradient="primary"
          />
        </Grid>
        <Grid item xs={6} sm={6} lg={3}>
          <StatsCard
            title="Total Products"
            value={data.totalProducts ?? 0}
            detail="In active catalog"
            icon={<Inventory2Icon />}
            gradient="info"
          />
        </Grid>
        <Grid item xs={6} sm={6} lg={3}>
          <StatsCard
            title="Today's Sales"
            value={currency(data.todaySales ?? 0)}
            detail="Revenue today"
            icon={<ReceiptLongIcon />}
            gradient="success"
          />
        </Grid>
        <Grid item xs={6} sm={6} lg={3}>
          <StatsCard
            title="Monthly Sales"
            value={currency(data.monthlySales ?? 0)}
            detail="This month"
            icon={<TrendingUpIcon />}
            gradient="secondary"
          />
        </Grid>
      </Grid>

      {/* Charts & Low Stock */}
      <Grid container spacing={2}>
        {/* Revenue Chart */}
        <Grid item xs={12} lg={8}>
          <Paper
            variant="outlined"
            sx={{ borderRadius: 3, p: 2.5, height: '100%', position: 'relative', overflow: 'hidden' }}
          >
            {/* Changing the period reloads only this card. A thin bar along the
                top says so without the chart jumping or the page blanking. */}
            {refreshing && (
              <LinearProgress
                sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 }}
              />
            )}
            {/* The period control lives here rather than at the top of the
                page, because it governs this chart alone — the cards above are
                today's and this month's figures whatever is selected. */}
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
        </Grid>

        {/* Low Stock Alert */}
        <Grid item xs={12} lg={4}>
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5, height: '100%' }}>
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
              <Box sx={{ height: 260, width: '100%' }}>
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
                    )}
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
        </Grid>
      </Grid>

      {/* Best and worst sellers, by month or year */}
      <ProductPerformance />

      {/* Recent Invoices */}
      <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5 }}>
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
  );
}
