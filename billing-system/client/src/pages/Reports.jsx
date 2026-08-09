import AssessmentIcon from '@mui/icons-material/Assessment';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PeopleIcon from '@mui/icons-material/People';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import GavelIcon from '@mui/icons-material/Gavel';
import {
  alpha, Box, Button, Chip, CircularProgress, Divider,
  Grid, Paper, Stack, Tab, Tabs, TextField, Typography, useTheme,
} from '@mui/material';
import { useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { reportsApi } from '../services/resource.service.js';
import { currency, date } from '../utils/formatters.js';
import { printDocument } from '../utils/print.js';

const REPORT_TYPES = [
  { key: 'sales', label: 'Sales', icon: <ReceiptIcon fontSize="small" />, color: 'primary' },
  { key: 'gst', label: 'GST', icon: <GavelIcon fontSize="small" />, color: 'warning' },
  { key: 'customers', label: 'Customers', icon: <PeopleIcon fontSize="small" />, color: 'info' },
  { key: 'products', label: 'Products', icon: <Inventory2Icon fontSize="small" />, color: 'success' },
  { key: 'inventory', label: 'Inventory', icon: <Inventory2Icon fontSize="small" />, color: 'secondary' },
];

// `render` draws the on-screen cell; `text` is the plain value used when printing.
const COLUMNS_MAP = {
  sales: [
    { field: 'invoiceNumber', headerName: 'Invoice #', render: (r) => <Typography fontWeight={700} color="primary.main">{r.invoiceNumber}</Typography> },
    { field: 'invoiceDate', headerName: 'Date', render: (r) => date(r.invoiceDate), text: (r) => date(r.invoiceDate) },
    { field: 'subtotal', headerName: 'Subtotal', numeric: true, render: (r) => currency(r.subtotal), text: (r) => currency(r.subtotal) },
    { field: 'gst', headerName: 'Total GST', numeric: true, render: (r) => currency(Number(r.cgst || 0) + Number(r.sgst || 0) + Number(r.igst || 0)), text: (r) => currency(Number(r.cgst || 0) + Number(r.sgst || 0) + Number(r.igst || 0)) },
    { field: 'grandTotal', headerName: 'Grand Total', numeric: true, render: (r) => <Typography fontWeight={700} color="success.main">{currency(r.grandTotal)}</Typography>, text: (r) => currency(r.grandTotal) },
  ],
  gst: [
    { field: 'invoiceNumber', headerName: 'Invoice #' },
    { field: 'invoiceDate', headerName: 'Date', render: (r) => date(r.invoiceDate), text: (r) => date(r.invoiceDate) },
    { field: 'cgst', headerName: 'CGST', numeric: true, render: (r) => currency(r.cgst), text: (r) => currency(r.cgst) },
    { field: 'sgst', headerName: 'SGST', numeric: true, render: (r) => currency(r.sgst), text: (r) => currency(r.sgst) },
    { field: 'igst', headerName: 'IGST', numeric: true, render: (r) => currency(r.igst), text: (r) => currency(r.igst) },
    { field: 'grandTotal', headerName: 'Total', numeric: true, render: (r) => currency(r.grandTotal), text: (r) => currency(r.grandTotal) },
  ],
  customers: [
    { field: 'customerName', headerName: 'Customer' },
    { field: 'mobileNumber', headerName: 'Mobile' },
    { field: 'city', headerName: 'City' },
    { field: 'state', headerName: 'State' },
  ],
  products: [
    { field: 'productName', headerName: 'Product' },
    { field: 'stock', headerName: 'Stock', numeric: true },
    { field: 'sellingPrice', headerName: 'Price', numeric: true, render: (r) => currency(r.sellingPrice), text: (r) => currency(r.sellingPrice) },
  ],
  inventory: [
    { field: 'productName', headerName: 'Product' },
    { field: 'stock', headerName: 'Stock', numeric: true },
    { field: 'sellingPrice', headerName: 'Unit Price', numeric: true, render: (r) => currency(r.sellingPrice), text: (r) => currency(r.sellingPrice) },
    { field: 'value', headerName: 'Stock Value', numeric: true, render: (r) => currency(Number(r.stock || 0) * Number(r.sellingPrice || 0)), text: (r) => currency(Number(r.stock || 0) * Number(r.sellingPrice || 0)) },
  ],
};

export default function Reports() {
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [filters, setFilters] = useState({ from: '', to: '' });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const currentType = REPORT_TYPES[tab];

  const load = async () => {
    setLoading(true);
    setLoaded(false);
    try {
      const result = await reportsApi[currentType.key](filters);
      setRows(Array.isArray(result) ? result : (result?.data ?? []));
      setLoaded(true);
    } catch {
      setRows([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = async () => {
    const blob = await reportsApi.export(currentType.key);
    window.open(URL.createObjectURL(blob), '_blank');
  };

  // Print the report rows on their own, without the surrounding app chrome.
  const printReport = () => {
    const period = filters.from || filters.to
      ? `Period: ${filters.from || 'beginning'} to ${filters.to || 'today'}`
      : 'All records';
    const salesTotal = rows.reduce((sum, r) => sum + Number(r.grandTotal || 0), 0);
    printDocument({
      title: `${currentType.label} Report`,
      subtitle: `${period}  •  ${rows.length} records`,
      columns: (COLUMNS_MAP[currentType.key] || []).map((column) => ({
        header: column.headerName,
        numeric: column.numeric,
        value: (row) => (column.text ? column.text(row) : row[column.field] ?? ''),
      })),
      rows,
      summary: currentType.key === 'sales'
        ? [{ label: 'Total', value: currency(salesTotal), total: true }]
        : [],
    });
  };

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Reports"
        subtitle="Analyse sales, GST, inventory and customer data"
        icon={<AssessmentIcon />}
      />

      {/* Report type tabs */}
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => { setTab(v); setRows([]); setLoaded(false); }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 2,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.03),
          }}
        >
          {REPORT_TYPES.map((rt, i) => (
            <Tab
              key={rt.key}
              label={
                <Stack direction="row" spacing={0.75} alignItems="center">
                  {rt.icon}
                  <span>{rt.label}</span>
                </Stack>
              }
            />
          ))}
        </Tabs>

        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          {/* Filters */}
          <Paper
            variant="outlined"
            sx={{ p: 2, borderRadius: 2.5, mb: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.02) }}
          >
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              Filter Options
            </Typography>
            <Grid container spacing={2} alignItems="flex-end">
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth type="date" label="From Date"
                  InputLabelProps={{ shrink: true }}
                  value={filters.from}
                  onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth type="date" label="To Date"
                  InputLabelProps={{ shrink: true }}
                  value={filters.to}
                  onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={load}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AssessmentIcon />}
                  sx={{ borderRadius: 2, height: 38 }}
                >
                  {loading ? 'Loading…' : `Generate ${currentType.label} Report`}
                </Button>
              </Grid>
            </Grid>
          </Paper>

          {/* Summary if loaded */}
          {loaded && rows.length > 0 && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mb={2.5} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label={`${rows.length} records`}
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
                {currentType.key === 'sales' && (
                  <Chip
                    label={`Total: ${currency(rows.reduce((s, r) => s + Number(r.grandTotal || 0), 0))}`}
                    color="success"
                    variant="filled"
                    sx={{ fontWeight: 700 }}
                  />
                )}
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={exportExcel}
                  variant="outlined"
                  sx={{ borderRadius: 2 }}
                >
                  Export Excel
                </Button>
                <Button
                  size="small"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={printReport}
                  variant="outlined"
                  sx={{ borderRadius: 2 }}
                >
                  Print PDF
                </Button>
              </Stack>
            </Stack>
          )}

          {/* Data Table */}
          {loaded ? (
            <DataTable
              columns={COLUMNS_MAP[currentType.key] || []}
              rows={rows}
              mobileKeyField={Object.keys(COLUMNS_MAP[currentType.key]?.[0] || {})[0]}
            />
          ) : !loading && (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
              <AssessmentIcon sx={{ fontSize: 48, opacity: 0.25, mb: 1.5 }} />
              <Typography variant="h6" fontWeight={600} color="text.secondary">
                Select filters and generate report
              </Typography>
              <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
                Choose a date range and click "Generate Report"
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>
    </Stack>
  );
}
