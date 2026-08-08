import Inventory2Icon from '@mui/icons-material/Inventory2';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { alpha, Box, Button, Chip, Grid, Paper, Stack, Typography, useTheme } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { dashboardApi } from '../services/resource.service.js';
import { currency, date } from '../utils/formatters.js';
import { useFetch } from '../hooks/useFetch.js';

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
  const { data, loading, error } = useFetch(() => dashboardApi.get(), []);
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
            sx={{ borderRadius: 3, p: 2.5, height: '100%' }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Revenue Trend</Typography>
                <Typography variant="caption" color="text.secondary">Last 30 days sales</Typography>
              </Box>
              <Chip label="Monthly" size="small" color="primary" variant="outlined" />
            </Stack>
            {chart.length > 0 ? (
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
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    bgcolor: alpha(theme.palette.warning.main, 0.12),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
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
              <Stack spacing={1}>
                {data.lowStockProducts.slice(0, 6).map((p, i) => (
                  <Stack
                    key={i}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.warning.main, 0.05),
                      border: `1px solid ${alpha(theme.palette.warning.main, 0.1)}`,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                      {p.productName}
                    </Typography>
                    <Chip
                      label={`${p.stock} left`}
                      size="small"
                      color={p.stock <= 0 ? 'error' : 'warning'}
                      variant="filled"
                      sx={{ fontSize: '0.7rem', fontWeight: 700 }}
                    />
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                <Typography variant="body2">All products stocked 🎉</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

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
