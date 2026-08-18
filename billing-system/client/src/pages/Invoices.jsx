import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DownloadIcon from '@mui/icons-material/Download';
import EmailIcon from '@mui/icons-material/Email';
import PaymentsIcon from '@mui/icons-material/Payments';
import PrintIcon from '@mui/icons-material/Print';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShareIcon from '@mui/icons-material/Share';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import {
  Accordion, AccordionDetails, AccordionSummary,
  alpha, Box, Button, Chip, Divider, Grid, IconButton,
  Menu, MenuItem, Paper, Stack, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import api from '../services/api.js';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import PeriodFilter from '../components/PeriodFilter.jsx';
import VisibilityIcon from '@mui/icons-material/Visibility';
import InvoiceDetailsModal from '../components/InvoiceDetailsModal.jsx';
import PaymentsModal from '../components/PaymentsModal.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { customersApi, invoicesApi, productsApi, settingsApi } from '../services/resource.service.js';
import CustomerPicker from '../components/CustomerPicker.jsx';
import { currency, date } from '../utils/formatters.js';
import { printDocument, printHtml, printPdfBlob } from '../utils/print.js';
import { buildThermalHtml, THERMAL_SIZES } from '../utils/thermal.js';
import ThermalPreview from '../components/ThermalPreview.jsx';
import { confirmAction } from '../utils/alerts.js';
import { can } from '../utils/access.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatPackage, formatProductTitle, formatProductOption } from '../utils/productFormatters.js';

const blankItem = { productId: '', quantity: 1, rate: 0, discount: 0, gstPercent: 18, packing: '', um: '', batchId: '' };

// Boxes printed on a bill of supply. Deductions come off the taxable value and
// additions go onto it, both before GST; cess is charged after GST.
const CHARGE_FIELDS = [
  ['quantityDiscount', 'Quantity Disc. (−)'],
  ['cashDiscount', 'Cash Discount (−)'],
  ['specialDiscount', 'Special Discount (−)'],
  ['freightDeducted', 'Freight (−)'],
  ['packingCharge', 'Packing (+)'],
  ['freightCharge', 'Freight (+)'],
  ['otherCharges', 'Other Charges (+)'],
  ['cess', 'Cess (after GST)'],
];
const DOCUMENT_TEXT_FIELDS = [
  'orderNumber', 'orderDate', 'dmNumber', 'dmDate', 'manualDm', 'manualDmDate',
  'transporter', 'vehicleNo', 'lrNumber', 'totalBags', 'remark',
];
const DEDUCTION_FIELDS = ['quantityDiscount', 'cashDiscount', 'specialDiscount', 'freightDeducted'];
const ADDITION_FIELDS = ['packingCharge', 'freightCharge', 'otherCharges'];

function calculate(items) {
  const subtotal = items.reduce((sum, it) => sum + Math.max(Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount || 0), 0), 0);
  const tax = items.reduce((sum, it) => {
    const taxable = Math.max(Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount || 0), 0);
    return sum + taxable * Number(it.gstPercent || 0) / 100;
  }, 0);
  const grand = Math.round(subtotal + tax);
  return { subtotal, cgst: tax / 2, sgst: tax / 2, igst: 0, grand, roundOff: grand - subtotal - tax };
}

function lineTotal(item) {
  const taxable = Math.max(Number(item.quantity || 0) * Number(item.rate || 0) - Number(item.discount || 0), 0);
  return taxable + taxable * Number(item.gstPercent || 0) / 100;
}

function PaymentChip({ method }) {
  const colors = { Cash: 'success', Card: 'info', UPI: 'primary', 'Bank Transfer': 'secondary', Credit: 'warning' };
  return <Chip label={method || 'Cash'} size="small" color={colors[method] || 'default'} variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
}

function DownloadMenu({ id }) {
  const [anchor, setAnchor] = useState(null);
  const download = async (template) => {
    setAnchor(null);
    const blob = await api.get(`/invoices/${id}/pdf?template=${template}`, { responseType: 'blob' }).then((r) => r.data);
    window.open(URL.createObjectURL(blob), '_blank');
  };
  return (
    <>
      <Tooltip title="Download PDF">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ borderRadius: 1.5 }}>
          <DownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {[['', 'Default'], ['standard', 'Standard'], ['modern', 'Modern'], ['compact', 'Compact'], ['premium', 'Premium'], ['thermal', 'Thermal (80mm)']].map(([t, l]) => (
          <MenuItem key={t} onClick={() => download(t)} sx={{ fontSize: '0.85rem' }}>{l}</MenuItem>
        ))}
      </Menu>
    </>
  );
}

function ShareMenu({ row }) {
  const [anchor, setAnchor] = useState(null);
  const share = (method) => {
    setAnchor(null);
    const text = `Hello ${row.Customer?.customerName}, here is Invoice ${row.invoiceNumber} for ${currency(row.grandTotal)}.`;
    if (method === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    else window.location.href = `mailto:?subject=Invoice ${row.invoiceNumber}&body=${encodeURIComponent(text)}`;
  };
  return (
    <>
      <Tooltip title="Share">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ borderRadius: 1.5 }}>
          <ShareIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => share('whatsapp')}><WhatsAppIcon sx={{ mr: 1, color: '#25D366', fontSize: 18 }} />WhatsApp</MenuItem>
        <MenuItem onClick={() => share('email')}><EmailIcon sx={{ mr: 1, color: '#EA4335', fontSize: 18 }} />Email</MenuItem>
      </Menu>
    </>
  );
}

/** Thermal-print dropdown: quick-print at a specific size OR open the preview modal. */
function ThermalMenu({ row, onPreview }) {
  const { showToast } = useToast();
  const [anchor, setAnchor] = useState(null);

  const quickPrint = async (size) => {
    setAnchor(null);
    try {
      const res  = await api.get(`/invoices/${row.id}`);
      const inv  = res.data?.data || res.data;
      const html = buildThermalHtml(inv, null, { size, showGst: true, showQr: true });
      printHtml(html);
    } catch {
      showToast('Could not load invoice for printing', 'error');
    }
  };

  return (
    <>
      <Tooltip title="Thermal / Receipt Print">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ borderRadius: 1.5 }}>
          <ReceiptLongIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        PaperProps={{ sx: { minWidth: 200 } }}
      >
        <MenuItem disabled sx={{ fontSize: '0.7rem', opacity: 0.6, py: 0.5 }}>QUICK PRINT</MenuItem>
        {THERMAL_SIZES.filter(s => s.value !== 'custom').map((s) => (
          <MenuItem key={s.value} onClick={() => quickPrint(s.value)} sx={{ fontSize: '0.85rem' }}>
            <ReceiptLongIcon sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />{s.label}
          </MenuItem>
        ))}
        <MenuItem divider />
        <MenuItem onClick={() => { setAnchor(null); onPreview(row); }} sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'primary.main' }}>
          <PrintIcon sx={{ mr: 1, fontSize: 16 }} />Preview &amp; Print…
        </MenuItem>
      </Menu>
    </>
  );
}

export default function Invoices() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10 , period: 'all', from: '', to: '', month: '' });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([blankItem]);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [payingFor, setPayingFor] = useState(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState(null);
  const [thermalInvoice, setThermalInvoice] = useState(null); // invoice object for ThermalPreview
  const [company, setCompany] = useState(null);

  const urlInvoiceId = searchParams.get('id') || searchParams.get('open');
  useEffect(() => {
    if (urlInvoiceId) setViewingInvoiceId(urlInvoiceId);
  }, [urlInvoiceId]);

  const handleCloseViewing = () => {
    setViewingInvoiceId(null);
    if (searchParams.get('id') || searchParams.get('open')) {
      searchParams.delete('id');
      searchParams.delete('open');
      setSearchParams(searchParams, { replace: true });
    }
  };
  const [couponCode, setCouponCode] = useState('');
  const [applied, setApplied] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState('');
  const [loyalty, setLoyalty] = useState(null);
  const [companyState, setCompanyState] = useState('');
  const { showToast } = useToast();
  const { user } = useAuth();
  const canEditInvoice = can('editInvoice', user?.role);
  const theme = useTheme();
  const { register, handleSubmit, reset, watch, control, formState: { isSubmitting } } = useForm({
    defaultValues: {
      invoiceDate: new Date().toISOString().slice(0, 10), customerId: '', paymentMethod: 'Cash', notes: '',
      orderNumber: '', orderDate: '', dmNumber: '', dmDate: '', manualDm: '', manualDmDate: '',
      transporter: '', vehicleNo: '', lrNumber: '', totalBags: '', remark: '',
      // Registered so `reset()` clears them between invoices.
      ...Object.fromEntries(CHARGE_FIELDS.map(([name]) => [name, ''])),
    },
  });
  const totals = useMemo(() => calculate(items), [items]);

  // The printed charge boxes change what the invoice is worth, so the preview
  // has to account for them too.
  const chargeArray = watch(CHARGE_FIELDS.map(([name]) => name));
  const chargeKey = chargeArray.join('|');
  const charges = useMemo(() => {
    const byName = Object.fromEntries(
      CHARGE_FIELDS.map(([name], i) => [name, Math.max(Number(chargeArray[i] || 0), 0)]),
    );
    return {
      addition: ADDITION_FIELDS.reduce((sum, n) => sum + byName[n], 0),
      deduction: DEDUCTION_FIELDS.reduce((sum, n) => sum + byName[n], 0),
      cess: byName.cess,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeKey]);

  // Mirrors the server: coupon, points and the charge boxes all move the taxable
  // value before GST, so the tax shown here matches what will actually be charged.
  const discounts = useMemo(() => {
    const coupon = Number(applied?.discount || 0);
    const points = Math.min(
      Number(redeemPoints || 0) * Number(loyalty?.redeemValue || 0),
      Math.max(totals.subtotal - coupon, 0),
    );
    const total = Math.min(coupon + points, totals.subtotal);
    const reduction = Math.min(coupon + points + charges.deduction, totals.subtotal);
    const taxable = Math.max(totals.subtotal - reduction + charges.addition, 0);
    const ratio = totals.subtotal > 0 ? taxable / totals.subtotal : 0;
    const cgst = totals.cgst * ratio;
    const sgst = totals.sgst * ratio;
    const beforeRound = taxable + cgst + sgst + totals.igst * ratio + charges.cess;
    const grand = Math.round(beforeRound);
    return { coupon, points, total, taxable, cgst, sgst, grand, roundOff: grand - beforeRound };
  }, [totals, applied, redeemPoints, loyalty, charges]);

  // Print the generated invoice PDF rather than the surrounding page.
  const printInvoice = async (id) => {
    try {
      const blob = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data);
      printPdfBlob(blob);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to print invoice', 'error');
    }
  };

  // Print through the designed HTML layout instead of the PDF renderer.
  const printInvoiceHtml = async (id) => {
    try {
      const html = await api.get(`/invoices/${id}/html`, { responseType: 'text' }).then((r) => r.data);
      printHtml(html);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to print invoice', 'error');
    }
  };

  // The invoice being composed has no PDF yet, so print its line items directly.
  const printDraft = () => {
    const selected = items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (!selected.length) {
      showToast('Add at least one item before printing', 'error');
      return;
    }
    const productName = (id) => products.find((p) => String(p.id) === String(id))?.productName || '—';
    printDocument({
      title: 'Invoice Draft',
      subtitle: `Prepared ${date(new Date())}`,
      columns: [
        { header: 'Product', value: (it) => productName(it.productId) },
        { header: 'Qty', value: (it) => it.quantity, numeric: true },
        { header: 'Rate', value: (it) => currency(it.rate), numeric: true },
        { header: 'Discount', value: (it) => currency(it.discount), numeric: true },
        { header: 'GST %', value: (it) => `${Number(it.gstPercent || 0)}%`, numeric: true },
        { header: 'Amount', value: (it) => currency(lineTotal(it)), numeric: true },
      ],
      rows: selected,
      summary: [
        { label: 'Subtotal', value: currency(totals.subtotal) },
        { label: 'CGST', value: currency(totals.cgst) },
        { label: 'SGST', value: currency(totals.sgst) },
        { label: 'Round Off', value: currency(totals.roundOff) },
        { label: 'Grand Total', value: currency(totals.grand), total: true },
      ],
    });
  };

  // Loyalty rules, and the chosen customer's balance.
  const selectedCustomerId = watch('customerId');
  const customerPoints = selectedCustomerId
    ? Number(customers.find((c) => String(c.id) === String(selectedCustomerId))?.loyaltyPoints ?? 0)
    : null;

  useEffect(() => {
    api.get('/loyalty/settings').then((r) => setLoyalty(r.data)).catch(() => setLoyalty(null));
    // The company's own state prefills a new customer's, since a walk-in is
    // almost always local — and it is what decides CGST/SGST versus IGST.
    settingsApi.get()
      .then((r) => { setCompanyState(r?.company?.state || ''); setCompany(r?.company || null); })
      .catch(() => setCompanyState(''));
  }, []);

  /** Open ThermalPreview: fetch full invoice detail first if needed. */
  const openThermalPreview = async (row) => {
    try {
      const res = await api.get(`/invoices/${row.id}`);
      setThermalInvoice(res.data?.data || res.data);
    } catch {
      showToast('Could not load invoice', 'error');
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [result, cr, pr] = await Promise.all([
        invoicesApi.list(query),
        customersApi.list({ limit: 200 }),
        productsApi.list({ limit: 200 }),
      ]);
      setRows(result?.data || []); setMeta(result?.meta || {});
      setCustomers(cr?.data || []); setProducts(pr?.data || []);
    } catch {
      setRows([]); setMeta({});
      setCustomers([]); setProducts([]);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [query]);

  const setItem = (i, patch) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const chooseProduct = (i, productId) => {
    const p = products.find((p) => String(p.id) === String(productId));
    const primaryUnit = p?.primaryUnit || 'PCS';
    const pkg = formatPackage(p);
    setItem(i, {
      productId,
      rate: Number(p?.sellingPrice || 0),
      gstPercent: Number(p?.gstPercent || 0),
      um: primaryUnit,
      packing: pkg || '',
      batchId: '',
    });
    loadBatches(productId);
  };

  const changeItemUnit = (i, unitCode) => {
    const item = items[i];
    const p = products.find((p) => String(p.id) === String(item.productId));
    let newRate = Number(item.rate || 0);

    if (p) {
      const primary = p.primaryUnit || 'PCS';
      const secondary = p.secondaryUnit || '';
      const factor = Number(p.unitConversionFactor || 1);

      if (unitCode === secondary && factor > 1) {
        newRate = p.secondarySellingPrice ? Number(p.secondarySellingPrice) : Number((p.sellingPrice / factor).toFixed(2));
      } else if (unitCode === primary) {
        newRate = Number(p.sellingPrice || 0);
      }
    }

    setItem(i, { um: unitCode, rate: newRate });
  };

  // Seed lots available per product, fetched once per product and cached. An
  // empty array means the product is not lot-tracked, so no picker is shown.
  const [batchesByProduct, setBatchesByProduct] = useState({});
  const loadBatches = async (productId) => {
    if (!productId || batchesByProduct[productId]) return;
    try {
      const list = await api.get(`/batches/available/${productId}`).then((r) => r.data);
      setBatchesByProduct((prev) => ({ ...prev, [productId]: list }));
    } catch {
      setBatchesByProduct((prev) => ({ ...prev, [productId]: [] }));
    }
  };

  const closeForm = () => {
    setOpen(false); setEditing(null); setItems([blankItem]); reset();
    setApplied(null); setCouponCode(''); setRedeemPoints('');
  };

  /** Loads an existing invoice back into the form for correction. */
  const openEdit = async (row) => {
    try {
      const invoice = await invoicesApi.get(row.id);
      setEditing(invoice);
      setItems((invoice.InvoiceItems || []).map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
        discount: Number(line.discount),
        gstPercent: Number(line.gstPercent),
        packing: line.packing || '',
        um: line.um || '',
        // The lot is deliberately not carried over: the edit re-allocates from
        // whatever is on the shelf now, exactly as a fresh sale would.
        batchId: '',
      })));
      reset({
        invoiceDate: invoice.invoiceDate,
        customerId: invoice.customerId,
        paymentMethod: invoice.paymentMethod,
        notes: invoice.notes || '',
        ...Object.fromEntries(DOCUMENT_TEXT_FIELDS.map((f) => [f, invoice[f] ?? ''])),
        ...Object.fromEntries(CHARGE_FIELDS.map(([name]) => [name, invoice[name] ?? ''])),
      });
      setCouponCode(invoice.couponCode || '');
      setApplied(invoice.couponCode
        ? { code: invoice.couponCode, discount: Number(invoice.couponDiscount || 0) }
        : null);
      setRedeemPoints(Number(invoice.pointsRedeemed) || '');
      setOpen(true);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to open that invoice', 'error');
    }
  };

  const submit = async (values) => {
    const selected = items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (!selected.length) { showToast('Add at least one product with quantity > 0', 'error'); return; }
    const invalid = selected.find(it => Number(it.rate) < 0 || Number(it.discount) < 0 || Number(it.gstPercent) < 0 || Number(it.gstPercent) > 100);
    if (invalid) { showToast('Invalid rate, discount, or GST percentage in line items', 'error'); return; }
    // An edit gives its own stock back first, so the on-screen check would
    // wrongly refuse simply moving a line around. The server is the authority.
    if (!editing) {
      const oversold = selected.find((it) => {
        const p = products.find((p) => p.id === Number(it.productId));
        if (!p) return false;
        // Convert billed quantity to primary-unit equivalent for the stock check.
        const billedUnit = it.um || p.primaryUnit || 'PCS';
        const primaryUnit = p.primaryUnit || 'PCS';
        const factor = Number(p.unitConversionFactor || 1);
        const primaryQty = (billedUnit !== primaryUnit && factor > 1)
          ? Number(it.quantity) * factor
          : Number(it.quantity);
        return primaryQty > Number(p.stock || 0);
      });
      if (oversold) {
        const p = products.find((p) => p.id === Number(oversold.productId));
        showToast(`${p.productName} only has ${p.stock} in stock (${p.primaryUnit || 'PCS'})`, 'error'); return;
      }
    }
    try {
      const payload = {
        ...values,
        items: selected,
        couponCode: applied?.code || undefined,
        redeemPoints: Number(redeemPoints) || undefined,
      };
      if (editing) {
        await invoicesApi.update(editing.id, payload);
        showToast(`${editing.invoiceNumber} updated`);
      } else {
        await invoicesApi.create(payload);
        showToast('Invoice saved');
      }
      closeForm();
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed to save invoice', 'error'); }
  };

  // Checks the code against the server so the counter sees the real discount
  // before the invoice is saved.
  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const result = await api.post('/coupons/validate', {
        code: couponCode.trim(),
        customerId: watch('customerId') || undefined,
        orderValue: totals.subtotal,
      }).then((r) => r.data);
      setApplied(result);
      showToast(`${result.code} applied — ${currency(result.discount)} off`);
    } catch (err) {
      setApplied(null);
      showToast(err.response?.data?.message || 'Coupon could not be applied', 'error');
    }
  };

  const cancelInvoice = async (id) => {
    const confirmed = await confirmAction({
      title: 'Cancel this invoice?',
      text: 'The invoice will be cancelled, its stock returned and its payments retired.',
      confirmText: 'Yes, cancel it',
    });
    if (!confirmed) return;
    try { await api.delete(`/invoices/${id}`); showToast('Invoice cancelled'); load(); }
    catch { showToast('Failed to cancel invoice', 'error'); }
  };

  /**
   * Confirm a Draft invoice — calls POST /invoices/:id/confirm.
   * The server validates stock availability and deducts it atomically.
   * On HTTP 409 (insufficient stock) an explicit error toast shows the product name and shortage.
   */
  const confirmInvoice = async (row) => {
    const confirmed = await confirmAction({
      title: `Confirm Invoice ${row.invoiceNumber}?`,
      text: 'Stock will be deducted immediately. This cannot be undone.',
      confirmText: 'Yes, confirm it',
    });
    if (!confirmed) return;
    try {
      await invoicesApi.confirm(row.id);
      showToast(`Invoice ${row.invoiceNumber} confirmed — stock deducted`, 'success');
      load();
    } catch (err) {
      // 409 = insufficient stock — surface the server message which names the product + shortfall.
      const msg = err.response?.data?.message || 'Could not confirm invoice';
      showToast(msg, 'error');
    }
  };

  // Summary stats
  const stats = useMemo(() => ({
    total: rows.length,
    revenue: rows.reduce((s, r) => s + Number(r.grandTotal || 0), 0),
    paid: rows.filter((r) => r.paymentMethod !== 'Credit').length,
    pending: rows.filter((r) => r.paymentMethod === 'Credit').length,
  }), [rows]);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Invoices"
        subtitle="Create and manage GST billing invoices"
        icon={<ReceiptIcon />}
        action={
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => { closeForm(); setOpen(true); }}>
            New Invoice
          </Button>
        }
      />

      <PeriodFilter
        value={query}
        onChange={(range) => setQuery({ ...query, ...range, page: 1 })}
      />

      {/* Stats */}
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatsCard title="Total Invoices" value={meta.total || stats.total} detail="All time" icon={<ReceiptIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Revenue" value={currency(stats.revenue)} detail="This page" icon={<ReceiptIcon />} gradient="success" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Paid" value={stats.paid} detail="This page" icon={<ReceiptIcon />} gradient="info" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Credit Pending" value={stats.pending} detail="This page" icon={<ReceiptIcon />} gradient="warning" />
        </Grid>
      </Grid>

      {/* Table */}
      {loading && rows.length === 0 ? <Loader /> : (
        <Box sx={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
        <>
          <DataTable
            mobileKeyField="invoiceNumber"
            columns={[
              { field: 'invoiceNumber', headerName: 'Invoice #', render: (row) => (
                <Typography
                  fontWeight={700}
                  color="primary.main"
                  onClick={() => setViewingInvoiceId(row.id)}
                  sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                >
                  {row.invoiceNumber}
                </Typography>
              )},
              { field: 'invoiceDate', headerName: 'Date', render: (row) => date(row.invoiceDate) },
              { field: 'customer', headerName: 'Customer', render: (row) => row.Customer?.customerName },
              { field: 'paymentMethod', headerName: 'Payment', render: (row) => <PaymentChip method={row.paymentMethod} /> },
              { field: 'status', headerName: 'Status', render: (row) => (
                <Chip
                  label={row.status || '—'} size="small" variant="outlined"
                  color={{ Paid: 'success', 'Partially Paid': 'warning', Unpaid: 'error', Cancelled: 'default', Draft: 'info' }[row.status] || 'default'}
                  sx={{ fontWeight: 700, fontSize: '0.7rem' }}
                />
              )},
              { field: 'grandTotal', headerName: 'Amount', render: (row) => (
                <Typography fontWeight={800} color="success.main">{currency(row.grandTotal)}</Typography>
              )},
              { field: 'actions', headerName: 'Actions', render: (row) => (
                <Stack direction="row" spacing={0.25}>
                  <Tooltip title="View Details">
                    <IconButton size="small" onClick={() => setViewingInvoiceId(row.id)} sx={{ borderRadius: 1.5, color: 'primary.main' }}>
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <DownloadMenu id={row.id} />
                  {/* Prints through the default invoice template. */}
                  <Tooltip title="Print"><IconButton size="small" onClick={() => printInvoiceHtml(row.id)} sx={{ borderRadius: 1.5 }}><PrintIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Print classic PDF layout"><IconButton size="small" onClick={() => printInvoice(row.id)} sx={{ borderRadius: 1.5 }}><ViewQuiltIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Payments"><IconButton size="small" onClick={() => setPayingFor(row)} sx={{ borderRadius: 1.5 }}><PaymentsIcon fontSize="small" /></IconButton></Tooltip>
                  {/* Only shown to roles that may edit; the API enforces it too. */}
                  {canEditInvoice && (
                    <Tooltip title="Edit Invoice">
                      <IconButton type="button" size="small" color="primary" onClick={() => openEdit(row)} sx={{ borderRadius: 1.5 }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <ShareMenu row={row} />
                  {/* Thermal / Receipt printer */}
                  <ThermalMenu row={row} onPreview={openThermalPreview} />
                  {/* Confirm Invoice — only for Draft invoices: deducts stock atomically */}
                  {row.status === 'Draft' && (
                    <Tooltip title="Confirm Invoice &amp; Deduct Stock">
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => confirmInvoice(row)}
                        sx={{ borderRadius: 1.5 }}
                      >
                        <CheckCircleIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Generate Gatepass">
                    <IconButton size="small" color="primary" onClick={() => navigate('/gatepasses')} sx={{ borderRadius: 1.5 }}>
                      <LocalShippingIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Cancel Invoice"><IconButton size="small" color="error" onClick={() => cancelInvoice(row.id)} sx={{ borderRadius: 1.5 }}><CancelIcon fontSize="small" /></IconButton></Tooltip>
                </Stack>
              )},
            ]}
            rows={rows}
            meta={meta}
          />
          <Pagination meta={meta} onChangePage={(p) => setQuery({ ...query, page: p })} onChangeLimit={(l) => setQuery({ ...query, limit: l })} />
        </>
        </Box>
      )}

      <InvoiceDetailsModal
        invoiceId={viewingInvoiceId}
        onClose={handleCloseViewing}
        onEdit={(inv) => openEdit(inv)}
        onManagePayments={(inv) => setPayingFor(inv)}
      />

      <PaymentsModal invoice={payingFor} onClose={() => setPayingFor(null)} onChanged={load} />

      {/* Thermal Receipt Preview Modal */}
      <ThermalPreview
        open={Boolean(thermalInvoice)}
        onClose={() => setThermalInvoice(null)}
        invoice={thermalInvoice}
        company={company}
        defaultSize={company?.thermalPaperSize || '80mm'}
        defaultOpts={{
          showGst: true,
          showQr: company?.thermalShowQr !== false,
          showLogo: Boolean(company?.thermalShowLogo),
          footer: company?.thermalFooter || '',
        }}
      />

      {/* Create Invoice Modal */}
      <Modal
        open={open}
        title={editing ? `Edit Invoice ${editing.invoiceNumber}` : 'Create New Invoice'}
        onClose={closeForm}
        maxWidth="lg"
      >
        <Stack spacing={3} component="form" onSubmit={handleSubmit(submit)}>
          {/* Header fields */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth type="date" label="Invoice Date" InputLabelProps={{ shrink: true }} {...register('invoiceDate', { required: true })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              {/* Tick "New customer" to add one here rather than abandoning
                  a half-built bill to go to the Customers screen. */}
              <Controller
                name="customerId"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <CustomerPicker
                    customers={customers}
                    value={field.value}
                    onChange={field.onChange}
                    onCustomerCreated={(created) => setCustomers((list) => [created, ...list])}
                    defaultState={companyState}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Payment Method" {...register('paymentMethod')}>
                {['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit'].map((m) => <MenuItem value={m} key={m}>{m}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>

          {/* Line Items */}
          <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.04), borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700}>Line Items</Typography>
            </Box>
            <Stack spacing={1.5} sx={{ p: 2 }}>
              {items.map((item, index) => (
                <Box key={index}>
                  <Grid container spacing={1} alignItems="center" wrap="nowrap" sx={{ minWidth: 0 }}>
                    <Grid item xs={12} md={2.5} sx={{ minWidth: 0 }}>
                      <TextField fullWidth select size="small" label="Product" value={item.productId} onChange={(e) => chooseProduct(index, e.target.value)}>
                        {products.map((p) => {
                          const pkg = formatPackage(p);
                          return (
                            <MenuItem value={p.id} key={p.id} disabled={Number(p.stock || 0) <= 0}>
                              <Box>
                                <Typography variant="body2" fontWeight={700}>{p.productName}</Typography>
                                {pkg && (
                                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, display: 'block' }}>
                                    Package: {pkg}
                                  </Typography>
                                )}
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {p.sku ? `SKU: ${p.sku} • ` : ''}Stock: {p.stock} • HSN: {p.hsnCode || '—'}
                                </Typography>
                              </Box>
                            </MenuItem>
                          );
                        })}
                      </TextField>
                    </Grid>
                    {[['quantity', 'Qty'], ['rate', 'Rate'], ['discount', 'Disc.'], ['gstPercent', 'GST%']].map(([name, label]) => (
                      <Grid item xs={6} sm={3} md={1} key={name}>
                        <TextField fullWidth size="small" type="number" label={label} value={item[name]} onChange={(e) => setItem(index, { [name]: e.target.value })} />
                      </Grid>
                    ))}
                    {/* Unit Selector (UM) */}
                    <Grid item xs={6} sm={3} md={1}>
                      <TextField
                        fullWidth select size="small" label="Unit (UM)"
                        value={item.um || 'PCS'}
                        onChange={(e) => changeItemUnit(index, e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      >
                        {(() => {
                          const p = products.find((p) => String(p.id) === String(item.productId));
                          const uList = [];
                          if (p?.primaryUnit) uList.push(p.primaryUnit);
                          if (p?.secondaryUnit && !uList.includes(p.secondaryUnit)) uList.push(p.secondaryUnit);
                          if (!uList.length) uList.push('PCS', 'KG', 'GM', 'BOX', 'BAG', 'LTR');
                          return uList.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>);
                        })()}
                      </TextField>
                    </Grid>
                    {/* Packing */}
                    <Grid item xs={6} sm={3} md={1}>
                      <TextField fullWidth size="small" label="Packing" placeholder="1 KG" value={item.packing || ''} onChange={(e) => setItem(index, { packing: e.target.value })} />
                    </Grid>
                    {/* Total */}
                    <Grid item xs={6} sm={3} md={1.5}>
                      <Box sx={{ px: 1, py: 0.75, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.08), textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" display="block">Total</Typography>
                        <Typography fontWeight={700} color="primary.main" fontSize="0.85rem">{currency(lineTotal(item))}</Typography>
                      </Box>
                    </Grid>
                    {/* Delete line item */}
                    <Grid item sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Tooltip title="Remove line" arrow>
                        <span>
                          <IconButton
                            type="button"
                            size="small"
                            onClick={() => removeItem(index)}
                            disabled={items.length === 1}
                            sx={{
                              color: items.length === 1 ? 'action.disabled' : 'error.main',
                              bgcolor: items.length === 1 ? 'transparent' : alpha(theme.palette.error.main, 0.08),
                              '&:hover': {
                                bgcolor: alpha(theme.palette.error.main, 0.18),
                              },
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Grid>
                  </Grid>
                  {/* Lot picker, only for products that actually have lots. */}
                  {batchesByProduct[item.productId]?.length > 0 && (
                    <Grid container spacing={1} sx={{ mt: 0.25 }}>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth select size="small" label="Seed lot"
                          value={item.batchId || ''}
                          onChange={(e) => setItem(index, { batchId: e.target.value })}
                          helperText="Leave blank to use the lot expiring soonest"
                          InputLabelProps={{ shrink: true }}
                        >
                          <MenuItem value="">Automatic (first to expire)</MenuItem>
                          {batchesByProduct[item.productId].map((b) => (
                            <MenuItem key={b.id} value={b.id}>
                              <Box>
                                <Typography variant="body2" fontWeight={600}>
                                  {b.batchNumber}
                                  {b.status === 'Expiring' ? ' — expiring soon' : ''}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {b.quantity} available
                                  {b.germinationPercent != null ? ` · germ ${Number(b.germinationPercent).toFixed(0)}%` : ''}
                                  {b.expiryDate ? ` · valid to ${date(b.expiryDate)}` : ''}
                                </Typography>
                              </Box>
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                    </Grid>
                  )}
                  {index < items.length - 1 && <Divider sx={{ mt: 1.5 }} />}
                </Box>
              ))}
              <Button type="button" startIcon={<AddIcon />} onClick={() => setItems([...items, blankItem])} sx={{ alignSelf: 'flex-start' }}>
                Add Product
              </Button>
            </Stack>
          </Paper>

          {/* Coupon and loyalty points */}
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
            <Grid container spacing={1.5} alignItems="center">
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth size="small" label="Coupon code"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setApplied(null); }}
                  // Enter inside a form submits it, which would save the
                  // invoice before the code had been applied.
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <Button
                  type="button"
                  fullWidth variant={applied ? 'contained' : 'outlined'} color={applied ? 'success' : 'primary'}
                  sx={{ borderRadius: 2, height: 40 }}
                  disabled={!couponCode.trim()}
                  onClick={applyCoupon}
                >
                  {applied ? 'Applied' : 'Apply'}
                </Button>
              </Grid>
              {loyalty?.enabled && (
                <>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small" type="number" label="Redeem points"
                      inputProps={{ min: 0, step: 1 }}
                      value={redeemPoints}
                      onChange={(e) => setRedeemPoints(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary">
                      {customerPoints == null
                        ? 'Choose a customer to see their points'
                        : `${customerPoints} points available · ₹${Number(loyalty.redeemValue).toFixed(2)} each`}
                      {customerPoints != null && customerPoints < loyalty.minRedeem
                        ? ` · need ${loyalty.minRedeem} to redeem` : ''}
                    </Typography>
                  </Grid>
                </>
              )}
            </Grid>
          </Paper>

          {/* Bill of supply extras — hidden by default so a plain cash sale
              stays a three-field form. */}
          <Accordion variant="outlined" disableGutters sx={{ borderRadius: 2.5, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2" fontWeight={700}>Dispatch details & charges</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5, alignSelf: 'center' }}>
                Order / DM numbers, transport, freight and discounts
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <Grid container spacing={1.5}>
                  {[
                    ['orderNumber', 'Order No.', 'text'], ['orderDate', 'Order Date', 'date'],
                    ['dmNumber', 'DM No.', 'text'], ['dmDate', 'DM Date', 'date'],
                    ['manualDm', 'Manual DM', 'text'], ['manualDmDate', 'Manual DM Date', 'date'],
                  ].map(([name, label, type]) => (
                    <Grid item xs={6} sm={4} md={2} key={name}>
                      <TextField fullWidth size="small" type={type} label={label} InputLabelProps={{ shrink: true }} {...register(name)} />
                    </Grid>
                  ))}
                </Grid>

                <Grid container spacing={1.5}>
                  <Grid item xs={12} sm={6} md={5}>
                    <TextField fullWidth size="small" label="Transporter" InputLabelProps={{ shrink: true }} {...register('transporter')} />
                  </Grid>
                  {[['vehicleNo', 'Vehicle No.'], ['lrNumber', 'LR No.']].map(([name, label]) => (
                    <Grid item xs={6} sm={3} md={2.5} key={name}>
                      <TextField fullWidth size="small" label={label} InputLabelProps={{ shrink: true }} {...register(name)} />
                    </Grid>
                  ))}
                  <Grid item xs={6} sm={3} md={2}>
                    <TextField fullWidth size="small" type="number" label="Total Bags" InputLabelProps={{ shrink: true }} {...register('totalBags')} />
                  </Grid>
                </Grid>

                <Divider />

                <Grid container spacing={1.5}>
                  {CHARGE_FIELDS.map(([name, label]) => (
                    <Grid item xs={6} sm={4} md={3} key={name}>
                      <TextField
                        fullWidth size="small" type="number" label={label}
                        inputProps={{ min: 0, step: 'any' }}
                        InputLabelProps={{ shrink: true }}
                        {...register(name)}
                      />
                    </Grid>
                  ))}
                  <Grid item xs={12}>
                    <TextField fullWidth size="small" label="Remark" InputLabelProps={{ shrink: true }} {...register('remark')} />
                  </Grid>
                </Grid>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Totals + Notes */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth multiline minRows={3} label="Notes / Terms" {...register('notes')} />
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Stack spacing={0.75}>
                  {[['Subtotal', currency(totals.subtotal)]].map(([l, v]) => (
                    <Stack key={l} direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">{l}</Typography>
                      <Typography variant="body2" fontWeight={500}>{v}</Typography>
                    </Stack>
                  ))}

                  {/* Both reductions come off before GST, so show them here. */}
                  {discounts.coupon > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="success.main">Coupon {applied?.code}</Typography>
                      <Typography variant="body2" fontWeight={600} color="success.main">−{currency(discounts.coupon)}</Typography>
                    </Stack>
                  )}
                  {discounts.points > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="success.main">Points ({redeemPoints})</Typography>
                      <Typography variant="body2" fontWeight={600} color="success.main">−{currency(discounts.points)}</Typography>
                    </Stack>
                  )}
                  {discounts.total > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Taxable value</Typography>
                      <Typography variant="body2" fontWeight={500}>{currency(discounts.taxable)}</Typography>
                    </Stack>
                  )}

                  {[['CGST', currency(discounts.cgst)], ['SGST', currency(discounts.sgst)], ['IGST', currency(totals.igst)], ['Round Off', currency(discounts.roundOff)]].map(([l, v]) => (
                    <Stack key={l} direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">{l}</Typography>
                      <Typography variant="body2" fontWeight={500}>{v}</Typography>
                    </Stack>
                  ))}
                  <Divider sx={{ my: 0.5 }} />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography fontWeight={800} fontSize="1rem">Grand Total</Typography>
                    <Typography fontWeight={800} fontSize="1.1rem" color="primary.main">{currency(discounts.grand)}</Typography>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          {/* Actions */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button type="button" onClick={closeForm} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button type="button" onClick={printDraft} startIcon={<PrintIcon />} variant="outlined" sx={{ borderRadius: 2 }}>Print</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2, minWidth: 140 }}>
              {isSubmitting ? 'Saving…' : editing ? 'Update Invoice' : 'Save Invoice'}
            </Button>
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
