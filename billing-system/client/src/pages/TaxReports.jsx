import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import DownloadIcon from '@mui/icons-material/Download';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
  Alert, Box, Button, Chip, Grid, MenuItem, Paper, Stack, Tab, Tabs,
  TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';
import { currency, date } from '../utils/formatters.js';

const pad2 = (n) => String(n).padStart(2, '0');
const monthStart = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
const monthEnd = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
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
  const [range, setRange] = useState({ from: monthStart(), to: monthEnd() });
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
  useEffect(() => { load(); }, [range.from, range.to]);

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
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
        <TextField
          size="small" type="date" label="From" value={range.from}
          onChange={(e) => setRange({ ...range, from: e.target.value })}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small" type="date" label="To" value={range.to}
          onChange={(e) => setRange({ ...range, to: e.target.value })}
          InputLabelProps={{ shrink: true }}
        />
        <Button
          variant="contained" startIcon={<DownloadIcon />}
          onClick={() => downloadWorkbook(
            `/reports/gstr1/export?from=${range.from}&to=${range.to}`,
            `GSTR1-${range.from}-to-${range.to}.xlsx`,
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
