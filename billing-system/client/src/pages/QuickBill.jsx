import BoltIcon from '@mui/icons-material/Bolt';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import {
  alpha, Box, Button, Chip, Divider, Grid, IconButton, MenuItem, Paper,
  Stack, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';
import { customersApi, invoicesApi, productsApi } from '../services/resource.service.js';
import { currency } from '../utils/formatters.js';
import { printPdfBlob } from '../utils/print.js';

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
  const theme = useTheme();
  const { showToast } = useToast();
  const scanRef = useRef(null);
  const [scan, setScan] = useState('');
  const [lines, setLines] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [saving, setSaving] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);

  useEffect(() => {
    customersApi.list({ limit: 200 }).then((r) => {
      const list = r?.data || [];
      setCustomers(list);
      if (list.length) setCustomerId(list[0].id);
    }).catch(() => setCustomers([]));
    productsApi.list({ limit: 500 }).then((r) => setProducts(r?.data || [])).catch(() => setProducts([]));
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
  const addProduct = useCallback((product, batch = null) => {
    setLines((prev) => {
      // Same product from the same lot is one line, not two.
      const index = prev.findIndex((l) => l.productId === product.id && l.batchId === (batch?.id || ''));
      if (index >= 0) {
        return prev.map((l, i) => (i === index ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, {
        productId: product.id,
        productName: product.productName,
        quantity: 1,
        rate: Number(product.sellingPrice || 0),
        discount: 0,
        gstPercent: Number(product.gstPercent || 0),
        batchId: batch?.id || '',
        batchNumber: batch?.batchNumber || '',
        stock: Number(product.stock || 0),
      }];
    });
    setLastAdded(product.productName);
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
      const { product, batches } = await api.get(`/products/barcode/${encodeURIComponent(code)}`).then((r) => r.data);
      addProduct(product, batches?.[0] || null);
      setScan('');
      return;
    } catch {
      // Not a barcode — fall through to a name match.
    }

    const needle = code.toLowerCase();
    const matches = products.filter((p) => p.productName.toLowerCase().includes(needle));
    if (matches.length === 1) {
      addProduct(matches[0]);
      setScan('');
    } else if (matches.length > 1) {
      const exact = matches.find((p) => p.productName.toLowerCase() === needle);
      if (exact) { addProduct(exact); setScan(''); }
      else showToast(`${matches.length} products match "${code}" — type more of the name`, 'info');
    } else {
      showToast(`Nothing found for "${code}"`, 'error');
    }
  }, [scan, products, addProduct, showToast]);

  const setLine = (index, patch) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));

  const clearBill = useCallback(() => {
    setLines([]);
    setScan('');
    setLastAdded(null);
    focusScan();
  }, [focusScan]);

  const save = useCallback(async (thenPrint = false) => {
    if (!lines.length) { showToast('Nothing on the bill yet', 'error'); return; }
    if (!customerId) { showToast('Choose a customer first', 'error'); return; }

    setSaving(true);
    try {
      const invoice = await invoicesApi.create({
        invoiceDate: new Date().toISOString().slice(0, 10),
        customerId,
        paymentMethod,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          rate: l.rate,
          discount: l.discount,
          gstPercent: l.gstPercent,
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

  // Shortcuts are registered on the window so they work wherever focus sits.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); focusScan(); }
      else if (e.key === 'F4') { e.preventDefault(); document.getElementById('quickbill-customer')?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); clearBill(); }
      else if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); save(false); }
      else if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); save(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusScan, clearBill, save]);

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
            <TextField
              fullWidth select id="quickbill-customer" label="Customer"
              value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              InputLabelProps={{ shrink: true }}
            >
              {customers.map((c) => <MenuItem key={c.id} value={c.id}>{c.customerName}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
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
                    <Grid item xs={12} md={4}>
                      <Typography variant="body2" fontWeight={600}>{line.productName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {line.gstPercent}% GST
                        {line.batchNumber ? ` · lot ${line.batchNumber}` : ''}
                        {line.quantity > line.stock ? ` · only ${line.stock} in stock` : ''}
                      </Typography>
                    </Grid>
                    {[['quantity', 'Qty'], ['rate', 'Rate'], ['discount', 'Disc.']].map(([field, label]) => (
                      <Grid item xs={4} md={2} key={field}>
                        <TextField
                          fullWidth size="small" type="number" label={label}
                          value={line[field]}
                          onChange={(e) => setLine(index, { [field]: Number(e.target.value) || 0 })}
                          inputProps={{ min: 0, step: 'any' }}
                        />
                      </Grid>
                    ))}
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
