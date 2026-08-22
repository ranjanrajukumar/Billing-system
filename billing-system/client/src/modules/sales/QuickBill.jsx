import BoltIcon from '@mui/icons-material/Bolt';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
  alpha, Box, Button, Chip, Divider, Grid, IconButton, MenuItem, Paper,
  Stack, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import api from '../../services/api.js';
import { customersApi, invoicesApi, productsApi, settingsApi } from '../../services/resource.service.js';
import CustomerPicker from './CustomerPicker.jsx';
import { currency } from '../../utils/formatters.js';
import { printHtml, printPdfBlob } from '../../utils/print.js';
import { buildThermalHtml } from '../../utils/thermal.js';
import { THERMAL_SIZES } from '../../utils/thermal.js';
import ThermalPreview from './ThermalPreview.jsx';
import { formatPackage, formatProductTitle, formatProductOption } from '../../utils/productFormatters.js';

/**
 * Counter billing driven from the keyboard.
 *
 * A barcode scanner behaves like a keyboard that types fast and presses Enter,
 * so the scan box stays focused and Enter is the only key needed for the common
 * case. Everything else has a shortcut so a busy counter never has to reach for
 * the mouse.
 */

const SHORTCUTS = [
  ['Enter', 'Add the scanned or typed item'],
  ['F2', 'Jump to the scan box'],
  ['F4', 'Change customer'],
  ['Ctrl + Enter', 'Save the bill'],
  ['Ctrl + P', 'Save and print'],
  ['Esc', 'Clear the current bill'],
];

const lineTaxable = (l) => Math.max(l.quantity * l.rate - l.discount, 0);
const lineTotal = (l) => lineTaxable(l) * (1 + l.gstPercent / 100);

export default function QuickBill() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [currencyCode, setCurrencyCode] = useState('INR');
  const [exchangeRate, setExchangeRate] = useState(1.0);
  const [scan, setScan] = useState('');
  const [lines, setLines] = useState([]);
  const [lastAdded, setLastAdded] = useState(null);
  const [saving, setSaving] = useState(false);
  const [companyState, setCompanyState] = useState('');
  const [company, setCompany] = useState(null);
  const [thermalPaperSize, setThermalPaperSize] = useState('80mm');
  const [thermalPreviewOpen, setThermalPreviewOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const { showToast } = useToast();
  const theme = useTheme();
  const scanRef = useRef(null);

  useEffect(() => {
    productsApi.list({ limit: 500 }).then((r) => setProducts(r?.data || [])).catch(() => setProducts([]));
    customersApi.list({ limit: 500 }).then((r) => setCustomers(r?.data || [])).catch(() => setCustomers([]));
    settingsApi.get()
      .then((r) => {
        setCompanyState(r?.company?.state || '');
        setCompany(r?.company || null);
        setThermalPaperSize(r?.company?.thermalPaperSize || '80mm');
      })
      .catch(() => setCompanyState(''));
  }, []);

  const focusScan = useCallback(() => scanRef.current?.focus(), []);
  useEffect(() => { focusScan(); }, [focusScan]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => sum + lineTaxable(l), 0);
    const tax = lines.reduce((sum, l) => sum + lineTaxable(l) * (l.gstPercent / 100), 0);
    const grand = Math.round(subtotal + tax);
    return {
      subtotal,
      tax,
      grand,
      roundOff: grand - subtotal - tax,
      units: lines.reduce((sum, l) => sum + l.quantity, 0),
    };
  }, [lines]);

  /** Adds a product, bumping the quantity if it is already on the bill. */
  /**
   * Adds a scanned or chosen item to the bill.
   *
   * `pack` is set when a packaged size was scanned. It is a different balance
   * and usually a different price from the loose product, so it gets its own
   * line: two pouches and 200g loose are not the same sale and must not merge.
   */
  const addProduct = useCallback((product, batch = null, pack = null) => {
    const dispName = pack ? `${product.productName} — ${pack.name}` : formatProductTitle(product);
    const pkgLabel = pack
      ? (pack.packSize ? `${pack.packSize}${pack.packUnitCode || ''}` : '')
      : formatPackage(product);

    setLines((prev) => {
      // Same product, same lot and same pack is one line, not two.
      const index = prev.findIndex((l) => (
        l.productId === product.id
        && l.batchId === (batch?.id || '')
        && (l.variantId || null) === (pack?.variantId || null)
      ));
      if (index >= 0) {
        return prev.map((l, i) => (i === index ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, {
        productId: product.id,
        variantId: pack?.variantId || null,
        productName: dispName,
        baseProductName: product.productName,
        pkgLabel,
        sku: pack?.sku || product.sku || '',
        quantity: 1,
        rate: Number(pack?.price ?? product.sellingPrice ?? 0),
        discount: 0,
        gstPercent: Number(product.gstPercent || 0),
        // A pack is counted in packs; there is nothing to convert.
        um: pack ? pack.name : (product.primaryUnit || 'PCS'),
        primaryUnit: pack ? pack.name : (product.primaryUnit || 'PCS'),
        secondaryUnit: product.secondaryUnit || '',
        unitConversionFactor: Number(product.unitConversionFactor || 1),
        batchId: batch?.id || '',
        batchNumber: batch?.batchNumber || '',
        stock: Number(product.stock || 0),
      }];
    });
    setLastAdded(dispName);
  }, []);

  /**
   * Resolves whatever is in the box: an exact barcode first, then a name match.
   * Typing a name and pressing Enter has to work as well as scanning, because
   * not every product carries a label.
   */
  const submitScan = useCallback(async () => {
    const code = scan.trim();
    if (!code) return;

    try {
      // `variant` comes back only when a pack's barcode was scanned.
      const { product, batches, variant } = await api.get(`/products/barcode/${encodeURIComponent(code)}`).then((r) => r.data);
      addProduct(product, batches?.[0] || null, variant || null);
      setScan('');
      return;
    } catch {
      // Not a barcode — fall through to a name match.
    }

    const needle = code.toLowerCase();
    
    const matches = products.filter((p) => {
      const fullName = formatProductOption(p).toLowerCase();
      return p.productName.toLowerCase().includes(needle) ||
             (p.sku && p.sku.toLowerCase().includes(needle)) ||
             fullName.includes(needle);
    });

    if (matches.length === 1) {
      addProduct(matches[0]);
      setScan('');
    } else if (matches.length > 1) {
      const exact = matches.find((p) => {
        const fullName = formatProductOption(p).toLowerCase();
        return p.productName.toLowerCase() === needle ||
               (p.sku && p.sku.toLowerCase() === needle) ||
               fullName === needle;
      });
      if (exact) { addProduct(exact); setScan(''); }
      else showToast(`${matches.length} products match "${code}" — type more of the name or SKU`, 'info');
    } else {
      showToast(`Nothing found for "${code}"`, 'error');
    }
  }, [scan, products, addProduct, showToast]);

  const setLine = (index, patch) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));

  const changeLineUnit = (index, unitCode) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== index) return l;
      const p = products.find((p) => String(p.id) === String(l.productId));
      let newRate = l.rate;
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
      return { ...l, um: unitCode, rate: newRate };
    }));
  };

  const clearBill = useCallback(() => {
    setLines([]);
    setScan('');
    setLastAdded(null);
    focusScan();
  }, [focusScan]);

  const save = useCallback(async (thenPrint = false) => {
    if (!lines.length) { showToast('Nothing on the bill yet', 'error'); return; }
    if (!customerId) { showToast('Choose a customer first', 'error'); return; }
    const invalid = lines.find(l => Number(l.quantity) <= 0 || Number(l.rate) < 0 || Number(l.discount) < 0 || Number(l.gstPercent) < 0 || Number(l.gstPercent) > 100);
    if (invalid) { showToast('Invalid quantity, rate, discount, or GST percentage in line items', 'error'); return; }

    setSaving(true);
    try {
      const invoice = await invoicesApi.create({
        invoiceDate: new Date().toISOString().slice(0, 10),
        customerId,
        paymentMethod,
        currency: currencyCode,
        exchangeRate,
        items: lines.map((l) => ({
          productId: l.productId,
          // Names the balance to take it from: a pack, or the loose pile.
          variantId: l.variantId || undefined,
          quantity: l.quantity,
          rate: l.rate,
          discount: l.discount,
          gstPercent: l.gstPercent,
          um: l.um || 'PCS',
          batchId: l.batchId || undefined,
        })),
      });
      showToast(`${invoice.invoiceNumber} saved — ${currency(invoice.grandTotal)}`);
      if (thenPrint) {
        const blob = await api.get(`/invoices/${invoice.id}/pdf`, { responseType: 'blob' }).then((r) => r.data);
        printPdfBlob(blob);
      }
      clearBill();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the bill', 'error');
    }
    setSaving(false);
  }, [lines, customerId, paymentMethod, showToast, clearBill]);

  /** Save and immediately print a thermal receipt at the configured paper size. */
  const saveThermal = useCallback(async (size) => {
    if (!lines.length) { showToast('Nothing on the bill yet', 'error'); return; }
    if (!customerId) { showToast('Choose a customer first', 'error'); return; }
    const invalid = lines.find(l => Number(l.quantity) <= 0 || Number(l.rate) < 0 || Number(l.discount) < 0 || Number(l.gstPercent) < 0 || Number(l.gstPercent) > 100);
    if (invalid) { showToast('Invalid quantity, rate, discount, or GST percentage in line items', 'error'); return; }
    setSaving(true);
    try {
      const invoice = await invoicesApi.create({
        invoiceDate: new Date().toISOString().slice(0, 10),
        customerId,
        paymentMethod,
        currency: currencyCode,
        exchangeRate,
        items: lines.map((l) => ({
          productId: l.productId, variantId: l.variantId || undefined,
          quantity: l.quantity,
          rate: l.rate, discount: l.discount,
          gstPercent: l.gstPercent, um: l.um || 'PCS',
          batchId: l.batchId || undefined,
        })),
      });
      showToast(`${invoice.invoiceNumber} saved — printing ${size} receipt`);
      // Fetch full invoice (with Customer + InvoiceItems associations)
      const full = await api.get(`/invoices/${invoice.id}`).then(r => r.data?.data || r.data);
      const html = buildThermalHtml(full, company, {
        size: size || thermalPaperSize,
        showGst: true,
        showQr: company?.thermalShowQr !== false,
        showLogo: Boolean(company?.thermalShowLogo),
        footer: company?.thermalFooter || '',
      });
      printHtml(html);
      clearBill();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the bill', 'error');
    }
    setSaving(false);
  }, [lines, customerId, paymentMethod, company, thermalPaperSize, showToast, clearBill]);

  // Shortcuts are registered on the window so they work wherever focus sits.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); focusScan(); }
      else if (e.key === 'F4') { e.preventDefault(); document.getElementById('quickbill-customer')?.focus(); }
      else if (e.key === 'F6') { e.preventDefault(); saveThermal(thermalPaperSize); }
      else if (e.key === 'Escape') { e.preventDefault(); clearBill(); }
      else if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); save(false); }
      else if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); save(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusScan, clearBill, save, saveThermal, thermalPaperSize]);

  return (
    <Stack spacing={2.5} className="animate-fadeInUp">
      <PageHeader
        title="Quick Bill"
        subtitle="Scan or type, press Enter. Ctrl+Enter saves, Ctrl+P saves and prints."
        icon={<BoltIcon />}
      />

      <Paper
        variant="outlined"
        sx={{ borderRadius: 3, p: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.03) }}
      >
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} md={5}>
            <TextField
              fullWidth autoFocus inputRef={scanRef} value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitScan(); } }}
              label="Scan barcode or type product name"
              placeholder="Waiting for a scan…"
              InputProps={{ startAdornment: <QrCodeScannerIcon sx={{ mr: 1, color: 'primary.main' }} /> }}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            {/* A walk-in who is not on file is the normal case at a counter,
                so they can be added here without losing the bill. */}
            <CustomerPicker
              inputId="quickbill-customer"
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
              onCustomerCreated={(created) => setCustomers((list) => [created, ...list])}
              defaultState={companyState}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth select label="Payment"
              value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
              InputLabelProps={{ shrink: true }}
            >
              {['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit'].map((m) => (
                <MenuItem key={m} value={m}>{m}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={1}>
            <TextField fullWidth label="Currency" InputLabelProps={{ shrink: true }} value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} />
          </Grid>
          <Grid item xs={6} md={1}>
            <TextField fullWidth type="number" inputProps={{ step: '0.0001' }} label="Exc. Rate" InputLabelProps={{ shrink: true }} value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value) || 1)} />
          </Grid>
        </Grid>
        {lastAdded && (
          <Typography variant="caption" color="success.main" sx={{ mt: 1, display: 'block', fontWeight: 700 }}>
            Added {lastAdded}
          </Typography>
        )}
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.04), borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {lines.length ? `${lines.length} ${lines.length === 1 ? 'line' : 'lines'} · ${totals.units} units` : 'Nothing scanned yet'}
              </Typography>
            </Box>

            {lines.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 7, color: 'text.secondary' }}>
                <QrCodeScannerIcon sx={{ fontSize: 44, opacity: 0.3 }} />
                <Typography variant="body2" sx={{ mt: 1 }}>Scan an item to begin</Typography>
              </Box>
            ) : (
              <Stack divider={<Divider />}>
                {lines.map((line, index) => (
                  <Grid container spacing={1} key={`${line.productId}-${line.batchId}`} alignItems="center" sx={{ p: 1.5 }}>
                    <Grid item xs={12} md={3}>
                      <Typography variant="body2" fontWeight={700}>
                        {line.baseProductName || line.productName}
                      </Typography>
                      {line.pkgLabel && (
                        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, display: 'block' }}>
                          Package: {line.pkgLabel}
                        </Typography>
                      )}
                      {line.sku && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontFamily: 'monospace' }}>
                          SKU: {line.sku}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {line.gstPercent}% GST
                        {line.batchNumber ? ` · lot ${line.batchNumber}` : ''}
                        {line.quantity > line.stock ? ` · only ${line.stock} in stock` : ''}
                      </Typography>
                    </Grid>
                    {[['quantity', 'Qty'], ['rate', 'Rate']].map(([field, label]) => (
                      <Grid item xs={4} md={1.75} key={field}>
                        <TextField
                          fullWidth size="small" type="number" label={label}
                          value={line[field]}
                          onChange={(e) => setLine(index, { [field]: Number(e.target.value) || 0 })}
                          inputProps={{ min: 0, step: 'any' }}
                        />
                      </Grid>
                    ))}
                    {/* Unit (UM) */}
                    <Grid item xs={4} md={1.5}>
                      <TextField
                        fullWidth select size="small" label="Unit"
                        value={line.um || 'PCS'}
                        onChange={(e) => changeLineUnit(index, e.target.value)}
                      >
                        {(() => {
                          const p = products.find((p) => String(p.id) === String(line.productId));
                          const uList = [];
                          if (p?.primaryUnit) uList.push(p.primaryUnit);
                          if (p?.secondaryUnit && !uList.includes(p.secondaryUnit)) uList.push(p.secondaryUnit);
                          if (!uList.length) uList.push('PCS', 'KG', 'GM', 'BOX', 'BAG');
                          return uList.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>);
                        })()}
                      </TextField>
                    </Grid>
                    <Grid item xs={4} md={1.75}>
                      <TextField
                        fullWidth size="small" type="number" label="Disc."
                        value={line.discount}
                        onChange={(e) => setLine(index, { discount: Number(e.target.value) || 0 })}
                        inputProps={{ min: 0, step: 'any' }}
                      />
                    </Grid>
                    <Grid item xs={8} md={1.5}>
                      <Typography fontWeight={700} color="primary.main" textAlign="right">
                        {currency(lineTotal(line))}
                      </Typography>
                    </Grid>
                    <Grid item xs={4} md={0.5}>
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error" onClick={() => removeLine(index)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Grid>
                  </Grid>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5 }}>
              <Stack spacing={1}>
                {[['Subtotal', totals.subtotal], ['GST', totals.tax], ['Round Off', totals.roundOff]].map(([label, value]) => (
                  <Stack key={label} direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                    <Typography variant="body2" fontWeight={600}>{currency(value)}</Typography>
                  </Stack>
                ))}
                <Divider />
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle1" fontWeight={800}>Total</Typography>
                  <Typography variant="h5" fontWeight={800} color="primary.main">{currency(totals.grand)}</Typography>
                </Stack>
              </Stack>

              <Stack spacing={1} sx={{ mt: 2 }}>
                <Button
                  fullWidth size="large" variant="contained"
                  disabled={saving || !lines.length}
                  onClick={() => save(false)}
                  sx={{ borderRadius: 2 }}
                >
                  {saving ? 'Saving…' : 'Save Bill  (Ctrl+Enter)'}
                </Button>
                <Button
                  fullWidth variant="outlined"
                  disabled={saving || !lines.length}
                  onClick={() => save(true)}
                  sx={{ borderRadius: 2 }}
                >
                  Save &amp; Print  (Ctrl+P)
                </Button>
                {/* Thermal receipt button — splits into size options */}
                <Button
                  fullWidth variant="outlined" color="secondary"
                  disabled={saving || !lines.length}
                  startIcon={<ReceiptLongIcon />}
                  onClick={() => saveThermal(thermalPaperSize)}
                  sx={{ borderRadius: 2 }}
                >
                  🧾 Thermal ({thermalPaperSize})  F6
                </Button>
                <Button
                  fullWidth color="inherit"
                  disabled={!lines.length}
                  onClick={clearBill}
                  sx={{ borderRadius: 2 }}
                >
                  Clear  (Esc)
                </Button>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>Keyboard</Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {SHORTCUTS.map(([key, what]) => (
                  <Stack key={key} direction="row" justifyContent="space-between" alignItems="center">
                    <Chip label={key} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 700 }} />
                    <Typography variant="caption" color="text.secondary">{what}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}

// ThermalPreview is loaded only when the QuickBill modal needs it
// (it is already imported above).
