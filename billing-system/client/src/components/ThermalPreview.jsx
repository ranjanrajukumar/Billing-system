/**
 * ThermalPreview.jsx
 *
 * A modal that renders a live, scaled preview of a thermal receipt alongside
 * paper-size controls. The user can switch between sizes and print directly.
 */
import PrintIcon from '@mui/icons-material/Print';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import {
  alpha, Box, Button, Chip, Dialog, DialogContent, DialogTitle,
  Divider, FormControlLabel, Grid, IconButton, MenuItem,
  Stack, Switch, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildThermalHtml, THERMAL_SIZES } from '../utils/thermal.js';
import { printHtml } from '../utils/print.js';
import { useToast } from '../context/ToastContext.jsx';

// Width (px) of the preview iframe at scale=1 for 80mm paper ≈ 302px
// We scale the iframe down to fit inside the modal
const MM_TO_PX = 3.78; // 1mm ≈ 3.78px at 96dpi

export default function ThermalPreview({ open, onClose, invoice, company, defaultSize, defaultOpts }) {
  const theme = useTheme();
  const { showToast } = useToast();
  const iframeRef = useRef(null);

  const [size, setSize]           = useState(defaultSize || '80mm');
  const [customMm, setCustomMm]   = useState(80);
  const [showGst, setShowGst]     = useState(defaultOpts?.showGst !== false);
  const [showQr, setShowQr]       = useState(defaultOpts?.showQr !== false);
  const [showHsn, setShowHsn]     = useState(defaultOpts?.showHsn === true);
  const [showLogo, setShowLogo]   = useState(defaultOpts?.showLogo === true);
  const [duplicate, setDuplicate] = useState(defaultOpts?.duplicate === true);
  const [footer, setFooter]       = useState(defaultOpts?.footer || '');

  // Re-sync when dialog reopens or invoice changes
  useEffect(() => {
    if (open) {
      setSize(defaultSize || '80mm');
      setDuplicate(false);
    }
  }, [open, defaultSize]);

  const opts = useMemo(() => ({
    size, customMm, showGst, showQr, showHsn, showLogo, duplicate,
    footer: footer || undefined,
  }), [size, customMm, showGst, showQr, showHsn, showLogo, duplicate, footer]);

  const html = useMemo(() => {
    if (!invoice || !open) return '';
    try { return buildThermalHtml(invoice, company, opts); }
    catch { return ''; }
  }, [invoice, company, opts, open]);

  // Inject HTML into preview iframe
  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || !html) return;
    frame.srcdoc = html;
  }, [html]);

  // Computed paper pixel width for sizing the preview box
  const paperWidthMm = size === 'custom' ? Number(customMm) || 80
    : parseInt(size, 10);
  const paperWidthPx = paperWidthMm * MM_TO_PX;

  // Scale preview to fit the modal panel (max ~350px)
  const maxPreviewPx  = 370;
  const scale         = Math.min(1, maxPreviewPx / paperWidthPx);
  const scaledWidth   = paperWidthPx * scale;
  const previewHeight = 560;

  const handlePrint = () => {
    if (!html) return;
    printHtml(html);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      showToast('Receipt HTML copied to clipboard', 'success');
    } catch {
      showToast('Could not copy', 'error');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `receipt-${invoice?.invoiceNumber || 'receipt'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box sx={{
            width: 36, height: 36, borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main',
          }}>
            <ReceiptLongIcon fontSize="small" />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography fontWeight={700} variant="h6" lineHeight={1}>
              Thermal Receipt Preview
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Invoice #{invoice?.invoiceNumber} · Adjust settings and print
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Download HTML">
              <IconButton size="small" onClick={handleDownload}><DownloadIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="Copy HTML">
              <IconButton size="small" onClick={handleCopy}><ContentCopyIcon fontSize="small" /></IconButton>
            </Tooltip>
            <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
          </Stack>
        </Stack>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 0 }}>
        <Grid container sx={{ height: '100%', minHeight: 520 }}>

          {/* ── Left: settings panel ────────────────────────────────────── */}
          <Grid item xs={12} sm={4} sx={{
            borderRight: { sm: 1 }, borderColor: 'divider',
            p: 2.5,
            bgcolor: alpha(theme.palette.primary.main, 0.015),
          }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, color: 'primary.main' }}>
              Printer Settings
            </Typography>

            {/* Paper size */}
            <TextField
              select fullWidth size="small" label="Paper Width"
              value={size} onChange={(e) => setSize(e.target.value)}
              sx={{ mb: 2 }}
            >
              {THERMAL_SIZES.map((s) => (
                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
              ))}
            </TextField>

            {/* Custom width input */}
            {size === 'custom' && (
              <TextField
                fullWidth size="small" type="number" label="Custom width (mm)"
                value={customMm}
                onChange={(e) => setCustomMm(Number(e.target.value))}
                inputProps={{ min: 30, max: 300, step: 1 }}
                sx={{ mb: 2 }}
              />
            )}

            {/* Toggles */}
            <Stack spacing={0.5}>
              {[
                ['Show GST Breakdown',     showGst,     setShowGst],
                ['Show QR Code',           showQr,      setShowQr],
                ['Show HSN Codes',         showHsn,     setShowHsn],
                ['Show Company Logo',      showLogo,    setShowLogo],
                ['Mark as DUPLICATE',      duplicate,   setDuplicate],
              ].map(([label, val, setter]) => (
                <FormControlLabel
                  key={label}
                  control={
                    <Switch
                      size="small"
                      checked={Boolean(val)}
                      onChange={(e) => setter(e.target.checked)}
                    />
                  }
                  label={<Typography variant="caption">{label}</Typography>}
                  sx={{ mx: 0 }}
                />
              ))}
            </Stack>

            {/* Custom footer */}
            <TextField
              fullWidth size="small" label="Footer message" multiline rows={2}
              value={footer} onChange={(e) => setFooter(e.target.value)}
              placeholder="Thank you for your business!"
              sx={{ mt: 2 }}
            />

            {/* Paper width indicator */}
            <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.08), border: 1, borderColor: alpha(theme.palette.success.main, 0.2) }}>
              <Typography variant="caption" color="success.main" fontWeight={700}>
                Paper: {paperWidthMm}mm ({Math.round(paperWidthPx)}px)
              </Typography>
              <br />
              <Typography variant="caption" color="text.secondary">
                Preview scale: {Math.round(scale * 100)}%
              </Typography>
            </Box>
          </Grid>

          {/* ── Right: receipt preview ──────────────────────────────────── */}
          <Grid item xs={12} sm={8} sx={{
            bgcolor: '#ccc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            p: 2,
            overflow: 'auto',
          }}>
            <Chip
              label={`${paperWidthMm}mm receipt`}
              size="small"
              color="primary"
              sx={{ mb: 1.5, fontWeight: 700 }}
            />

            {/* Scaled iframe */}
            <Box sx={{
              background: '#fff',
              boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
              border: '1px solid #bbb',
              width: scaledWidth,
              height: previewHeight,
              overflow: 'hidden',
              position: 'relative',
            }}>
              <iframe
                ref={iframeRef}
                title="Thermal Receipt Preview"
                style={{
                  border: 'none',
                  width: paperWidthPx,
                  height: previewHeight / scale,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              />
            </Box>
          </Grid>
        </Grid>
      </DialogContent>

      <Divider />

      {/* Footer actions */}
      <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
        <Button variant="outlined" onClick={onClose} sx={{ borderRadius: 2 }}>
          Close
        </Button>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          Print {paperWidthMm}mm Receipt
        </Button>
      </Box>
    </Dialog>
  );
}
