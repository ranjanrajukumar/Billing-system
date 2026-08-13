import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import PaymentsIcon from '@mui/icons-material/Payments';
import PrintIcon from '@mui/icons-material/Print';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ShareIcon from '@mui/icons-material/Share';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EmailIcon from '@mui/icons-material/Email';
import PersonIcon from '@mui/icons-material/Person';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import {
  alpha, Box, Button, Chip, Divider, Grid, IconButton, Menu, MenuItem,
  Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../services/api.js';
import Modal from './Modal.jsx';
import Loader from './Loader.jsx';
import { currency, date } from '../utils/formatters.js';
import { printHtml, printPdfBlob } from '../utils/print.js';
import { useToast } from '../context/ToastContext.jsx';
import { can } from '../utils/access.js';
import { useAuth } from '../context/AuthContext.jsx';

function StatusChip({ status }) {
  const config = {
    Paid: { color: 'success', label: 'Paid' },
    'Partially Paid': { color: 'warning', label: 'Partially Paid' },
    Unpaid: { color: 'error', label: 'Unpaid' },
    Cancelled: { color: 'default', label: 'Cancelled' },
  };
  const cfg = config[status] || { color: 'default', label: status || 'Draft' };
  return (
    <Chip
      label={cfg.label}
      color={cfg.color}
      size="small"
      sx={{ fontWeight: 700, fontSize: '0.75rem', px: 0.5 }}
    />
  );
}

export default function InvoiceDetailsModal({ invoiceId, invoice: initialInvoice, onClose, onEdit, onManagePayments }) {
  const [invoice, setInvoice] = useState(initialInvoice || null);
  const [loading, setLoading] = useState(!initialInvoice);
  const [shareAnchor, setShareAnchor] = useState(null);
  const [downloadAnchor, setDownloadAnchor] = useState(null);
  const { showToast } = useToast();
  const { user } = useAuth();
  const theme = useTheme();

  useEffect(() => {
    if (!invoiceId) return;
    setLoading(true);
    api.get(`/invoices/${invoiceId}`)
      .then((res) => {
        setInvoice(res.data);
        setLoading(false);
      })
      .catch((err) => {
        showToast(err.response?.data?.message || 'Failed to load invoice details', 'error');
        setLoading(false);
      });
  }, [invoiceId]);

  if (!invoiceId && !initialInvoice) return null;

  const data = invoice || initialInvoice;

  const handlePrintHtml = async () => {
    try {
      const html = await api.get(`/invoices/${data.id}/html`, { responseType: 'text' }).then((r) => r.data);
      printHtml(html);
    } catch {
      showToast('Failed to print invoice', 'error');
    }
  };

  const handleDownloadPdf = async (template = '') => {
    setDownloadAnchor(null);
    try {
      const blob = await api.get(`/invoices/${data.id}/pdf?template=${template}`, { responseType: 'blob' }).then((r) => r.data);
      printPdfBlob(blob);
    } catch {
      showToast('Failed to download invoice PDF', 'error');
    }
  };

  const handleShare = (method) => {
    setShareAnchor(null);
    const text = `Hello ${data?.Customer?.customerName || 'Valued Customer'}, here is Invoice ${data?.invoiceNumber} for ${currency(data?.grandTotal)}.`;
    if (method === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      window.location.href = `mailto:?subject=Invoice ${data?.invoiceNumber}&body=${encodeURIComponent(text)}`;
    }
  };

  const totalPaid = (data?.Payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const balanceDue = Math.max(Number(data?.grandTotal || 0) - totalPaid, 0);

  return (
    <Modal open={Boolean(invoiceId || initialInvoice)} title="" onClose={onClose} maxWidth="md">
      {loading ? (
        <Box sx={{ py: 6 }}><Loader /></Box>
      ) : !data ? (
        <Typography color="error" align="center" sx={{ py: 4 }}>Invoice not found</Typography>
      ) : (
        <Stack spacing={3}>
          {/* Top Bar Header */}
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.primary.main, 0.03),
              borderColor: alpha(theme.palette.primary.main, 0.15),
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.main',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <ReceiptIcon />
                </Box>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6" fontWeight={800} color="primary.main">
                      {data.invoiceNumber}
                    </Typography>
                    <StatusChip status={data.status} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Issued on {date(data.invoiceDate)} • Payment: {data.paymentMethod || 'Cash'}
                  </Typography>
                </Box>
              </Stack>

              {/* Action Buttons */}
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button size="small" variant="contained" startIcon={<PrintIcon />} onClick={handlePrintHtml} sx={{ borderRadius: 2 }}>
                  Print
                </Button>
                <IconButton size="small" onClick={(e) => setDownloadAnchor(e.currentTarget)} sx={{ borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
                <Menu anchorEl={downloadAnchor} open={Boolean(downloadAnchor)} onClose={() => setDownloadAnchor(null)}>
                  {[['', 'Default PDF'], ['standard', 'Standard'], ['modern', 'Modern'], ['compact', 'Compact'], ['premium', 'Premium'], ['thermal', 'Thermal (80mm)']].map(([t, l]) => (
                    <MenuItem key={t} onClick={() => handleDownloadPdf(t)} sx={{ fontSize: '0.85rem' }}>{l}</MenuItem>
                  ))}
                </Menu>

                <IconButton size="small" onClick={(e) => setShareAnchor(e.currentTarget)} sx={{ borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
                  <ShareIcon fontSize="small" />
                </IconButton>
                <Menu anchorEl={shareAnchor} open={Boolean(shareAnchor)} onClose={() => setShareAnchor(null)}>
                  <MenuItem onClick={() => handleShare('whatsapp')}><WhatsAppIcon sx={{ mr: 1, color: '#25D366', fontSize: 18 }} />WhatsApp</MenuItem>
                  <MenuItem onClick={() => handleShare('email')}><EmailIcon sx={{ mr: 1, color: '#EA4335', fontSize: 18 }} />Email</MenuItem>
                </Menu>

                {onManagePayments && (
                  <Tooltip title="Payments">
                    <IconButton size="small" color="success" onClick={() => { onClose(); onManagePayments(data); }} sx={{ borderRadius: 1.5, border: 1, borderColor: alpha(theme.palette.success.main, 0.3) }}>
                      <PaymentsIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}

                {can('editInvoice', user?.role) && onEdit && (
                  <Tooltip title="Edit Invoice">
                    <IconButton size="small" color="primary" onClick={() => { onClose(); onEdit(data); }} sx={{ borderRadius: 1.5, border: 1, borderColor: alpha(theme.palette.primary.main, 0.3) }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Stack>
          </Paper>

          {/* Customer & Info Grid */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, height: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, color: 'primary.main' }}>
                  <PersonIcon fontSize="small" />
                  <Typography variant="subtitle2" fontWeight={700}>Customer Information</Typography>
                </Stack>
                <Typography variant="body2" fontWeight={700}>
                  {data.Customer?.customerName || 'Walk-in Customer'}
                </Typography>
                {data.Customer?.mobileNumber && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    Phone: {data.Customer.mobileNumber}
                  </Typography>
                )}
                {data.Customer?.gstNumber && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    GSTIN: {data.Customer.gstNumber}
                  </Typography>
                )}
                {data.Customer?.address && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {data.Customer.address}{data.Customer.city ? `, ${data.Customer.city}` : ''}
                  </Typography>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, height: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, color: 'info.main' }}>
                  <LocalShippingIcon fontSize="small" />
                  <Typography variant="subtitle2" fontWeight={700}>Dispatch Details</Typography>
                </Stack>
                <Grid container spacing={1}>
                  {data.orderNumber && <Grid item xs={6}><Typography variant="caption" color="text.secondary">Order #: {data.orderNumber}</Typography></Grid>}
                  {data.dmNumber && <Grid item xs={6}><Typography variant="caption" color="text.secondary">DM #: {data.dmNumber}</Typography></Grid>}
                  {data.transporter && <Grid item xs={6}><Typography variant="caption" color="text.secondary">Transporter: {data.transporter}</Typography></Grid>}
                  {data.vehicleNo && <Grid item xs={6}><Typography variant="caption" color="text.secondary">Vehicle #: {data.vehicleNo}</Typography></Grid>}
                  {data.lrNumber && <Grid item xs={6}><Typography variant="caption" color="text.secondary">LR #: {data.lrNumber}</Typography></Grid>}
                  {data.totalBags && <Grid item xs={6}><Typography variant="caption" color="text.secondary">Total Bags: {data.totalBags}</Typography></Grid>}
                </Grid>
                {!data.orderNumber && !data.dmNumber && !data.transporter && !data.vehicleNo && (
                  <Typography variant="caption" color="text.disabled" italic>Standard counter dispatch</Typography>
                )}
              </Paper>
            </Grid>
          </Grid>

          {/* Line Items Table */}
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2.5 }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Product Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>HSN</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Qty</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Rate</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Disc</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>GST %</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.InvoiceItems || []).map((item, idx) => (
                  <TableRow key={item.id || idx} hover>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{item.Product?.productName || item.productName || 'Product'}</TableCell>
                    <TableCell>{item.Product?.hsnCode || item.hsnCode || '—'}</TableCell>
                    <TableCell align="right">{item.quantity} {item.um || ''}</TableCell>
                    <TableCell align="right">{currency(item.rate)}</TableCell>
                    <TableCell align="right">{item.discount > 0 ? currency(item.discount) : '—'}</TableCell>
                    <TableCell align="right">{item.gstPercent}%</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{currency(item.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Calculation Breakdown & Notes */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              {data.notes && (
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ mb: 0.5 }}>
                    NOTES / REMARK
                  </Typography>
                  <Typography variant="body2">{data.notes || data.remark}</Typography>
                </Paper>
              )}
            </Grid>

            <Grid item xs={12} md={data.notes ? 6 : 12}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                    <Typography variant="body2" fontWeight={600}>{currency(data.subtotal)}</Typography>
                  </Stack>
                  {Number(data.cgst || 0) > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">CGST</Typography>
                      <Typography variant="body2">{currency(data.cgst)}</Typography>
                    </Stack>
                  )}
                  {Number(data.sgst || 0) > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">SGST</Typography>
                      <Typography variant="body2">{currency(data.sgst)}</Typography>
                    </Stack>
                  )}
                  {Number(data.igst || 0) > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">IGST</Typography>
                      <Typography variant="body2">{currency(data.igst)}</Typography>
                    </Stack>
                  )}
                  {Number(data.roundOff || 0) !== 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Round Off</Typography>
                      <Typography variant="body2">{currency(data.roundOff)}</Typography>
                    </Stack>
                  )}
                  <Divider />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography fontWeight={800} fontSize="1.05rem">Grand Total</Typography>
                    <Typography fontWeight={800} fontSize="1.15rem" color="primary.main">{currency(data.grandTotal)}</Typography>
                  </Stack>
                  {data.paymentMethod === 'Credit' && (
                    <Stack direction="row" justifyContent="space-between" sx={{ pt: 0.5 }}>
                      <Typography variant="caption" color="warning.main" fontWeight={700}>Balance Due</Typography>
                      <Typography variant="caption" color="warning.main" fontWeight={700}>{currency(balanceDue)}</Typography>
                    </Stack>
                  )}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Stack>
      )}
    </Modal>
  );
}
