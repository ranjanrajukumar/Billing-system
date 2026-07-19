import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { Button, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import { reportsApi } from '../services/resource.service.js';
import { currency, date } from '../utils/formatters.js';

export default function Reports() {
  const [filters, setFilters] = useState({ from: '', to: '' });
  const [rows, setRows] = useState([]);
  const load = async (type) => setRows(await reportsApi[type](filters));
  const exportExcel = async (type) => {
    const blob = await reportsApi.export(type);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };
  return (
    <Stack spacing={2}>
      <Typography variant="h4">Reports</Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={3}><TextField fullWidth type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Grid>
          <Grid item xs={12} sm={3}><TextField fullWidth type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Grid>
          <Grid item xs={12} sm={6}><Stack direction="row" spacing={1} flexWrap="wrap">{['sales', 'gst', 'customers', 'products', 'inventory'].map((type) => <Button key={type} variant="outlined" onClick={() => load(type)}>{type}</Button>)}</Stack></Grid>
        </Grid>
      </Paper>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button startIcon={<DownloadIcon />} onClick={() => exportExcel('sales')}>Excel</Button><Button startIcon={<PictureAsPdfIcon />}>PDF</Button></Stack>
      <DataTable rows={rows} columns={[
        { field: 'invoiceNumber', headerName: 'Invoice', render: (row) => row.invoiceNumber || row.productName || row.customerName },
        { field: 'invoiceDate', headerName: 'Date', render: (row) => date(row.invoiceDate || row.createdAt) },
        { field: 'subtotal', headerName: 'Subtotal', render: (row) => row.subtotal ? currency(row.subtotal) : '-' },
        { field: 'gst', headerName: 'GST', render: (row) => currency(Number(row.cgst || 0) + Number(row.sgst || 0) + Number(row.igst || 0)) },
        { field: 'grandTotal', headerName: 'Total/Stock', render: (row) => row.grandTotal ? currency(row.grandTotal) : row.stock }
      ]} />
    </Stack>
  );
}
