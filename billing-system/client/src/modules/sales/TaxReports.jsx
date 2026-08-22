import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import DownloadIcon from '@mui/icons-material/Download';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
  Alert, Box, Button, Chip, Grid, MenuItem, Paper, Stack, Tab, Tabs,
  TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import PeriodFilter from '../../components/PeriodFilter.jsx';
import Loader from '../../components/Loader.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import api from '../../services/api.js';
import { currency, date } from '../../utils/formatters.js';

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Downloads a workbook without navigating away from the page. */
async function downloadWorkbook(url, filename, onError) {
  try {
    const blob = await api.get(url, { responseType: 'blob' }).then((r) => r.data);
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  } catch (err) {
    onError(err.response?.data?.message || 'Download failed');
  }
}

function Gstr1Panel() {
  // Opens on the named period rather than a date pair, so the filter shows
  // "This month" instead of an equivalent-looking custom range.
  const [range, setRange] = useState({ period: 'thisMonth', from: '', to: '', month: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState('b2b');
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get('/reports/gstr1', { params: range }).then((r) => r.data);
      setData(result);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load GSTR-1', 'error');
      setData(null);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [range.from, range.to, range.period, range.month]);

  const t = data?.totals;
  const sections = {
    b2b: { label: `B2B (${data?.b2b?.length || 0})`, rows: data?.b2b || [] },
    b2c: { label: `B2C (${data?.b2c?.length || 0})`, rows: data?.b2c || [] },
    rate: { label: 'Rate summary', rows: data?.rateSummary || [] },
    hsn: { label: 'HSN summary', rows: data?.hsnSummary || [] },
  };

  const invoiceColumns = [
    { field: 'invoiceNumber', headerName: 'Invoice' },
    { field: 'invoiceDate', headerName: 'Date', render: (r) => date(r.invoiceDate) },
    { field: 'customerName', headerName: 'Party' },
    { field: 'gstin', headerName: 'GSTIN', render: (r) => r.gstin || '—' },
    { field: 'placeOfSupply', headerName: 'Place of Supply' },
    { field: 'rate', headerName: 'Rate', render: (r) => (r.rate === 'Mixed' ? 'Mixed' : `${r.rate}%`) },
    { field: 'taxableValue', headerName: 'Taxable', render: (r) => currency(r.taxableValue) },
    { field: 'invoiceValue', headerName: 'Invoice Value', render: (r) => (
      <Typography fontWeight={700}>{currency(r.invoiceValue)}</Typography>
    )},
  ];

  const columnsFor = {
    b2b: invoiceColumns,
    b2c: invoiceColumns,
    rate: [
      { field: 'rate', headerName: 'Rate', render: (r) => `${r.rate}%` },
      { field: 'invoiceCount', headerName: 'Invoices' },
      { field: 'taxableValue', headerName: 'Taxable', render: (r) => currency(r.taxableValue) },
      { field: 'cgst', headerName: 'CGST', render: (r) => currency(r.cgst) },
      { field: 'sgst', headerName: 'SGST', render: (r) => currency(r.sgst) },
      { field: 'igst', headerName: 'IGST', render: (r) => currency(r.igst) },
    ],
    hsn: [
      { field: 'hsn', headerName: 'HSN' },
      { field: 'description', headerName: 'Description' },
      { field: 'uqc', headerName: 'UQC' },
      { field: 'quantity', headerName: 'Quantity' },
      { field: 'taxableValue', headerName: 'Taxable', render: (r) => currency(r.taxableValue) },
      { field: 'totalValue', headerName: 'Total', render: (r) => currency(r.totalValue) },
    ],
  };

  return (
    <Stack spacing={2}>
      {/* One place to choose the period — the filter carries its own custom
          date boxes, so a second pair here would only be a way to disagree. */}
      <Stack
        direction={{ xs: 'column', md: 'row' }} spacing={1.5}
        alignItems={{ md: 'center' }} justifyContent="space-between"
      >
        <Box sx={{ flex: 1 }}>
          <PeriodFilter value={range} onChange={(next) => setRange({ ...range, ...next })} />
        </Box>
        <Button
          variant="contained" startIcon={<DownloadIcon />}
          // The export must use whatever the filter resolved to, whether that
          // came from a preset or the date boxes.
          onClick={() => downloadWorkbook(
            `/reports/gstr1/export?${new URLSearchParams(
              range.from || range.to
                ? { from: range.from || '', to: range.to || '' }
                : range.period === 'month' && range.month
                  ? { period: 'month', month: range.month }
                  : { period: range.period || 'thisMonth' },
            )}`,
            `GSTR1-${data?.period?.from || range.from}-to-${data?.period?.to || range.to}.xlsx`,
            (m) => showToast(m, 'error'),
          )}
        >
          Download Excel
        </Button>
      </Stack>

      <Alert severity="info" sx={{ borderRadius: 2 }}>
        These are working papers for GSTR-1, laid out like the GST offline utility.
        Check the figures against your books before filing — the return itself is still filed on the portal.
      </Alert>

      {loading ? <Loader /> : !data ? null : (
        <>
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <StatsCard title="Invoices" value={t.invoiceCount} detail={`${t.b2bCount} B2B · ${t.b2cCount} B2C`} icon={<ReceiptLongIcon />} gradient="primary" />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatsCard title="Taxable Value" value={currency(t.taxableValue)} detail="Before GST" icon={<ReceiptLongIcon />} gradient="info" />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatsCard title="Total GST" value={currency(t.cgst + t.sgst + t.igst)} detail={`CGST ${currency(t.cgst)} · SGST ${currency(t.sgst)} · IGST ${currency(t.igst)}`} icon={<AccountBalanceIcon />} gradient="warning" />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatsCard title="Invoice Value" value={currency(t.invoiceValue)} detail="Including tax" icon={<ReceiptLongIcon />} gradient="success" />
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Filing as {data.company.name} · GSTIN {data.company.gstin || 'not set'} · {data.company.state}
            </Typography>
          </Paper>

          <Tabs value={section} onChange={(_e, v) => setSection(v)} variant="scrollable" scrollButtons="auto">
            {Object.entries(sections).map(([key, s]) => <Tab key={key} value={key} label={s.label} />)}
          </Tabs>

          <DataTable rows={sections[section].rows} columns={columnsFor[section]} />
        </>
      )}
    </Stack>
  );
}

function AgeingPanel() {
  const [asOf, setAsOf] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('customers');
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get('/reports/ageing', { params: { asOf } }).then((r) => r.data);
      setData(result);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load ageing report', 'error');
      setData(null);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [asOf]);

  const bucketColour = { current: 'default', d0_30: 'info', d31_60: 'warning', d61_90: 'warning', d90_plus: 'error' };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
        <TextField
          size="small" type="date" label="As at" value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          helperText="Payments after this date are ignored"
          InputLabelProps={{ shrink: true }}
        />
        <Button
          variant="contained" startIcon={<DownloadIcon />}
          onClick={() => downloadWorkbook(
            `/reports/ageing/export?asOf=${asOf}`,
            `Receivables-ageing-${asOf}.xlsx`,
            (m) => showToast(m, 'error'),
          )}
        >
          Download Excel
        </Button>
      </Stack>

      {loading ? <Loader /> : !data ? null : (
        <>
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <StatsCard title="Total Outstanding" value={currency(data.totals.outstanding)} detail={`${data.totals.invoices} open invoices`} icon={<AccountBalanceIcon />} gradient="primary" />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatsCard title="Customers Owing" value={data.totals.customers} detail="With a balance" icon={<AccountBalanceIcon />} gradient="info" />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatsCard title="Overdue 90+ days" value={currency(data.totals.buckets.d90_plus)} detail="Chase these first" icon={<AccountBalanceIcon />} gradient="error" />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatsCard title="Not Yet Due" value={currency(data.totals.buckets.current)} detail="Within credit terms" icon={<AccountBalanceIcon />} gradient="success" />
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {data.buckets.map((b) => (
                <Chip
                  key={b.key}
                  color={bucketColour[b.key]}
                  variant={data.totals.buckets[b.key] > 0 ? 'filled' : 'outlined'}
                  label={`${b.label}: ${currency(data.totals.buckets[b.key])}`}
                  sx={{ fontWeight: 700 }}
                />
              ))}
            </Stack>
          </Paper>

          <Tabs value={view} onChange={(_e, v) => setView(v)}>
            <Tab value="customers" label={`By customer (${data.customers.length})`} />
            <Tab value="invoices" label={`By invoice (${data.invoices.length})`} />
          </Tabs>

          {view === 'customers' ? (
            <DataTable
              rows={data.customers}
              mobileKeyField="customerName"
              columns={[
                { field: 'customerName', headerName: 'Customer' },
                { field: 'mobileNumber', headerName: 'Mobile', render: (r) => r.mobileNumber || '—' },
                { field: 'invoiceCount', headerName: 'Invoices' },
                ...data.buckets.map((b) => ({
                  field: b.key,
                  headerName: b.label,
                  render: (r) => (r.buckets[b.key] ? currency(r.buckets[b.key]) : '—'),
                })),
                { field: 'outstanding', headerName: 'Total Due', render: (r) => (
                  <Typography fontWeight={800} color="primary.main">{currency(r.outstanding)}</Typography>
                )},
                { field: 'oldestDays', headerName: 'Oldest', render: (r) => (
                  <Chip
                    size="small"
                    color={r.oldestDays > 90 ? 'error' : r.oldestDays > 30 ? 'warning' : 'default'}
                    variant="outlined"
                    label={r.oldestDays > 0 ? `${r.oldestDays}d` : 'Current'}
                    sx={{ fontWeight: 700, fontSize: '0.7rem' }}
                  />
                )},
              ]}
            />
          ) : (
            <DataTable
              rows={data.invoices}
              mobileKeyField="invoiceNumber"
              columns={[
                { field: 'invoiceNumber', headerName: 'Invoice' },
                { field: 'invoiceDate', headerName: 'Date', render: (r) => date(r.invoiceDate) },
                { field: 'dueDate', headerName: 'Due', render: (r) => (r.dueDate ? date(r.dueDate) : '—') },
                { field: 'customerName', headerName: 'Customer' },
                { field: 'grandTotal', headerName: 'Total', render: (r) => currency(r.grandTotal) },
                { field: 'paid', headerName: 'Paid', render: (r) => currency(r.paid) },
                { field: 'outstanding', headerName: 'Due', render: (r) => (
                  <Typography fontWeight={700} color="error.main">{currency(r.outstanding)}</Typography>
                )},
                { field: 'bucketLabel', headerName: 'Age', render: (r) => (
                  <Chip size="small" color={bucketColour[r.bucket]} variant="outlined"
                    label={r.bucketLabel} sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
                )},
              ]}
            />
          )}
        </>
      )}
    </Stack>
  );
}

export default function TaxReports() {
  const [tab, setTab] = useState('gstr1');

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="GST & Receivables"
        subtitle="Outward supply working papers and who owes you what"
        icon={<AccountBalanceIcon />}
      />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="gstr1" label="GSTR-1" />
        <Tab value="ageing" label="Receivables Ageing" />
      </Tabs>
      <Box>{tab === 'gstr1' ? <Gstr1Panel /> : <AgeingPanel />}</Box>
    </Stack>
  );
}
