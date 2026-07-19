import Inventory2Icon from '@mui/icons-material/Inventory2';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import { dashboardApi } from '../services/resource.service.js';
import { currency, date } from '../utils/formatters.js';
import { useFetch } from '../hooks/useFetch.js';

function Metric({ title, value, icon }) {
  return <Card variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><div><Typography color="text.secondary">{title}</Typography><Typography variant="h5">{value}</Typography></div>{icon}</Stack></CardContent></Card>;
}

export default function Dashboard() {
  const { data, loading, error } = useFetch(() => dashboardApi.get(), []);
  if (loading) return <Loader />;
  if (error) return <Typography color="error" variant="h6">Failed to load dashboard: {error}. Please log out and log in again.</Typography>;
  if (!data) return null;
  const chart = data?.charts?.sales || [];
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Dashboard</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} lg={3}><Metric title="Total Customers" value={data.totalCustomers} icon={<PeopleIcon color="primary" />} /></Grid>
        <Grid item xs={12} sm={6} lg={3}><Metric title="Total Products" value={data.totalProducts} icon={<Inventory2Icon color="primary" />} /></Grid>
        <Grid item xs={12} sm={6} lg={3}><Metric title="Today's Sales" value={currency(data.todaySales)} icon={<ReceiptLongIcon color="primary" />} /></Grid>
        <Grid item xs={12} sm={6} lg={3}><Metric title="Monthly Sales" value={currency(data.monthlySales)} icon={<TrendingUpIcon color="primary" />} /></Grid>
        <Grid item xs={12} lg={8}>
          <Card variant="outlined"><CardContent><Typography variant="h6">Revenue</Typography><LineChart height={280} dataset={chart} xAxis={[{ dataKey: 'date', scaleType: 'point' }]} series={[{ dataKey: 'total', label: 'Sales' }]} /></CardContent></Card>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Card variant="outlined"><CardContent><Typography variant="h6">Low Stock Products</Typography><DataTable columns={[{ field: 'productName', headerName: 'Product' }, { field: 'stock', headerName: 'Stock' }]} rows={data.lowStockProducts} /></CardContent></Card>
        </Grid>
      </Grid>
      <div>
        <Typography variant="h6" sx={{ mb: 1 }}>Recent Invoices</Typography>
        <DataTable columns={[
          { field: 'invoiceNumber', headerName: 'Invoice' },
          { field: 'invoiceDate', headerName: 'Date', render: (row) => date(row.invoiceDate) },
          { field: 'customer', headerName: 'Customer', render: (row) => row.Customer?.customerName },
          { field: 'grandTotal', headerName: 'Total', render: (row) => currency(row.grandTotal) }
        ]} rows={data.recentInvoices} />
      </div>
    </Stack>
  );
}
