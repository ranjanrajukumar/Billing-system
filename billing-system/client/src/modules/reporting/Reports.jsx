import AssessmentIcon from '@mui/icons-material/Assessment';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PeopleIcon from '@mui/icons-material/People';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import GavelIcon from '@mui/icons-material/Gavel';
import BusinessIcon from '@mui/icons-material/Business';
import {
  alpha, Avatar, Box, Button, CircularProgress,
  Checkbox, Grid, ListItemText, Menu, MenuItem, Paper, Stack, Tab, Tabs, Typography, useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import PeriodFilter, { periodLabel } from '../../components/PeriodFilter.jsx';
import api from '../../services/api.js';
import { reportsApi } from '../../services/resource.service.js';
import { currency, date, mediaUrl } from '../../utils/formatters.js';
import { printDocument } from '../../utils/print.js';

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

const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
const taxOf = (row) => Number(row.cgst || 0) + Number(row.sgst || 0) + Number(row.igst || 0);

/**
 * The figures worth reading at the top of each report. A page of rows with no
 * totals makes the reader add up columns by hand, which is what turns a report
 * into a data dump.
 */
function summarise(key, rows) {
  if (!rows.length) return [];
  switch (key) {
    case 'sales':
      return [
        ['Invoices', String(rows.length)],
        ['Taxable Value', currency(sum(rows, 'subtotal'))],
        ['Total GST', currency(rows.reduce((t, r) => t + taxOf(r), 0))],
        ['Total Billed', currency(sum(rows, 'grandTotal'))],
      ];
    case 'gst':
      return [
        ['Invoices', String(rows.length)],
        ['CGST', currency(sum(rows, 'cgst'))],
        ['SGST', currency(sum(rows, 'sgst'))],
        ['IGST', currency(sum(rows, 'igst'))],
      ];
    case 'customers':
      return [
        ['Customers', String(rows.length)],
        ['With GSTIN', String(rows.filter((r) => r.gstNumber).length)],
        ['Cities', String(new Set(rows.map((r) => r.city).filter(Boolean)).size)],
      ];
    case 'products':
      return [
        ['Products', String(rows.length)],
        ['Units in Stock', String(sum(rows, 'stock'))],
        ['Out of Stock', String(rows.filter((r) => Number(r.stock || 0) <= 0).length)],
      ];
    case 'inventory':
      return [
        ['Products', String(rows.length)],
        ['Units in Stock', String(sum(rows, 'stock'))],
        ['Stock Value', currency(rows.reduce((t, r) => t + Number(r.stock || 0) * Number(r.sellingPrice || 0), 0))],
      ];
    default:
      return [['Records', String(rows.length)]];
  }
}

export default function Reports() {
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [filters, setFilters] = useState({ from: '', to: '', period: 'thisMonth' , month: '' });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [company, setCompany] = useState(null);
  const [selectedFields, setSelectedFields] = useState({});
  const [fieldMenuAnchor, setFieldMenuAnchor] = useState(null);

  const currentType = REPORT_TYPES[tab];
  const stats = summarise(currentType.key, rows);
  const availableColumns = COLUMNS_MAP[currentType.key] || [];
  const companyLogo = mediaUrl(company?.logoUrl);
  // Each report begins with all fields selected; selections are retained per tab.
  const printedFields = selectedFields[currentType.key] || availableColumns.map((column) => column.field);
  const printedColumns = availableColumns.filter((column) => printedFields.includes(column.field));

  // Only for the printed header; a failure here must not stop reports working.
  useEffect(() => {
    api.get('/settings')
      .then((r) => setCompany(r.data?.company || null))
      .catch(() => setCompany(null));
  }, []);

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
    // Same filters as the screen, or the file will not match the report.
    const blob = await reportsApi.export(currentType.key, filters);
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${currentType.key}-report.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };

  // Print the report rows on their own, without the surrounding app chrome.
  const printReport = () => {
    if (!printedColumns.length) return;
    const period = periodLabel(filters);
    const generated = new Date().toLocaleString('en-IN');

    // The printed sheet has to stand on its own once it leaves the screen, so
    // it carries who produced it, for what period, and when.
    const stats = summarise(currentType.key, rows);
    printDocument({
      title: `${currentType.label} Report`,
      subtitle: [
        `Period: ${period}`,
        `${rows.length} records`,
        `Generated ${generated}`,
      ].filter(Boolean).join('  •  '),
      header: {
        companyName: company?.name,
        logoUrl: companyLogo,
        centered: true,
        details: [company?.address, company?.city, company?.state, company?.mobile].filter(Boolean).join(' | '),
      },
      footer: `${company?.name || 'Billing System'} | ${currentType.label} report | ${generated}`,
      columns: printedColumns.map((column) => ({
        header: column.headerName,
        numeric: column.numeric,
        value: (row) => (column.text ? column.text(row) : row[column.field] ?? ''),
      })),
      rows,
      summary: stats.map(([label, value], i) => ({
        label,
        value,
        total: i === stats.length - 1,
      })),
    });
  };

  const togglePrintedField = (field) => {
    setSelectedFields((previous) => {
      const selected = previous[currentType.key] || availableColumns.map((column) => column.field);
      return {
        ...previous,
        [currentType.key]: selected.includes(field)
          ? selected.filter((value) => value !== field)
          : [...selected, field],
      };
    });
  };

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Reports"
        subtitle="Analyse sales, GST, inventory and customer data"
        icon={<AssessmentIcon />}
      />

      {/* A report is a client-facing business document as well as an internal
          table. Keep the company identity visible while the user builds it. */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 }, borderRadius: 3, color: 'primary.contrastText',
          bgcolor: 'primary.main', overflow: 'hidden', position: 'relative',
          '&::after': {
            content: '""', position: 'absolute', width: 220, height: 220, borderRadius: '50%',
            right: -80, top: -120, bgcolor: alpha('#fff', 0.1),
          },
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} position="relative" zIndex={1}>
          <Avatar
            variant="rounded"
            src={companyLogo || undefined}
            imgProps={{ alt: `${company?.name || 'Company'} logo` }}
            sx={{ width: 58, height: 58, bgcolor: alpha('#fff', 0.16), color: 'inherit', borderRadius: 2.5 }}
          >
            <BusinessIcon />
          </Avatar>
          <Box flex={1} minWidth={0}>
            <Typography variant="overline" sx={{ opacity: 0.78, letterSpacing: 1.2 }}>Reporting centre</Typography>
            <Typography variant="h5" fontWeight={800} noWrap>{company?.name || 'Your Company'}</Typography>
            <Typography variant="body2" sx={{ opacity: 0.86, mt: 0.25 }}>
              {company?.gstNumber ? `GSTIN: ${company.gstNumber}  |  ` : ''}
              Prepare clear, branded reports for management, auditors and clients.
            </Typography>
          </Box>
          <Box sx={{ px: 1.5, py: 1, border: 1, borderColor: alpha('#fff', 0.3), borderRadius: 2, textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>Selected report</Typography>
            <Typography fontWeight={800}>{currentType.label}</Typography>
          </Box>
        </Stack>
      </Paper>

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
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={1.5}>
              <Box>
                <Typography variant="subtitle1" fontWeight={800}>Build your {currentType.label.toLowerCase()} report</Typography>
                <Typography variant="caption" color="text.secondary">Choose a reporting period, then generate the live report.</Typography>
              </Box>
              <Typography variant="caption" color="primary.main" fontWeight={700}>Step 1 of 2</Typography>
            </Stack>
            <Grid container spacing={2} alignItems="flex-end">
              <Grid item xs={12}>
                <PeriodFilter disableContainer value={filters} onChange={(range) => setFilters({ ...filters, ...range })} />
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
            <Stack spacing={2} mb={2.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={0.75}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={800}>Report overview</Typography>
                  <Typography variant="caption" color="text.secondary">{periodLabel(filters)} · {rows.length} records ready for review</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">Step 2 of 2 · Export or print</Typography>
              </Stack>
              {/* The figures that matter for this report, so nobody has to add
                  up a column of rows by hand. */}
              <Grid container spacing={1.5}>
                {stats.map(([label, value], i) => (
                  <Grid item xs={6} md={3} key={label}>
                    <Paper
                      variant="outlined"
                      sx={{
                        borderRadius: 2.5,
                        px: 2,
                        py: 1.5,
                        height: '100%',
                        // The last figure is the headline one for each report.
                        bgcolor: i === stats.length - 1
                          ? alpha(theme.palette.primary.main, 0.06)
                          : 'transparent',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        {label}
                      </Typography>
                      <Typography
                        variant="h6"
                        fontWeight={800}
                        color={i === stats.length - 1 ? 'primary.main' : 'text.primary'}
                        sx={{ lineHeight: 1.3 }}
                      >
                        {value}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              <Stack direction="row" spacing={1} justifyContent="flex-end">
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
                  startIcon={<ViewColumnIcon />}
                  onClick={(event) => setFieldMenuAnchor(event.currentTarget)}
                  variant="outlined"
                  sx={{ borderRadius: 2 }}
                >
                  Print fields ({printedColumns.length})
                </Button>
                <Button
                  size="small"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={printReport}
                  disabled={!printedColumns.length}
                  variant="outlined"
                  sx={{ borderRadius: 2 }}
                >
                  Print PDF
                </Button>
                <Menu
                  anchorEl={fieldMenuAnchor}
                  open={Boolean(fieldMenuAnchor)}
                  onClose={() => setFieldMenuAnchor(null)}
                >
                  {availableColumns.map((column) => (
                    <MenuItem key={column.field} onClick={() => togglePrintedField(column.field)} dense>
                      <Checkbox checked={printedFields.includes(column.field)} size="small" />
                      <ListItemText primary={column.headerName} />
                    </MenuItem>
                  ))}
                </Menu>
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
