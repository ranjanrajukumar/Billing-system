import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box, Button, Chip, Divider, Grid, IconButton, MenuItem,
  Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { paymentsApi } from '../../services/resource.service.js';
import { currency, date } from '../../utils/formatters.js';

const METHODS = ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit'];
const STATUS_COLORS = { Paid: 'success', 'Partially Paid': 'warning', Unpaid: 'error', Cancelled: 'default' };

const blankForm = { amount: '', paymentMethod: 'Cash', referenceNumber: '' };

/**
 * Payment history and balance for a single invoice.
 * `invoice` is the row being viewed; `onChanged` refreshes the caller's list.
 */
export default function PaymentsModal({ invoice, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    if (!invoice) return;
    try {
      setData(await paymentsApi.forInvoice(invoice.id));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load payments', 'error');
      setData(null);
    }
  };
  useEffect(() => { load(); }, [invoice?.id]);

  const summary = data?.summary;

  const addPayment = async () => {
    setSaving(true);
    try {
      await paymentsApi.create({
        invoiceId: invoice.id,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        referenceNumber: form.referenceNumber || undefined,
      });
      showToast('Payment recorded');
      setForm(blankForm);
      await load();
      onChanged?.();
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to record payment', 'error');
    }
    setSaving(false);
  };

  const removePayment = async (id) => {
    try {
      await paymentsApi.remove(id);
      showToast('Payment removed');
      await load();
      onChanged?.();
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to remove payment', 'error');
    }
  };

  const outstanding = Number(summary?.outstanding || 0);

  return (
    <Modal open={Boolean(invoice)} title={`Payments — ${invoice?.invoiceNumber || ''}`} onClose={onClose} maxWidth="md">
      <Stack spacing={2.5}>
        <Grid container spacing={2}>
          {[
            { label: 'Invoice Total', value: currency(summary?.grandTotal), color: 'text.primary' },
            { label: 'Paid', value: currency(summary?.paid), color: 'success.main' },
            { label: 'Outstanding', value: currency(outstanding), color: outstanding > 0 ? 'error.main' : 'success.main' },
          ].map((tile) => (
            <Grid item xs={12} sm={4} key={tile.label}>
              <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
                <Typography variant="caption" color="text.secondary">{tile.label}</Typography>
                <Typography variant="h6" fontWeight={800} color={tile.color}>{tile.value}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary">Status</Typography>
          <Chip
            label={summary?.status || '—'}
            size="small"
            color={STATUS_COLORS[summary?.status] || 'default'}
            sx={{ fontWeight: 700 }}
          />
        </Stack>

        <Divider />

        {outstanding > 0 ? (
          <Stack spacing={1.5}>
            <Typography variant="subtitle2" fontWeight={700}>Record a Payment</Typography>
            <Grid container spacing={1.5} alignItems="center">
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth size="small" label="Amount" type="number"
                  inputProps={{ min: 0, step: 'any' }}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  select fullWidth size="small" label="Method"
                  value={form.paymentMethod}
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                >
                  {METHODS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth size="small" label="Reference"
                  value={form.referenceNumber}
                  onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6} sm={1.5}>
                <Button
                  fullWidth size="small" variant="outlined" sx={{ borderRadius: 2 }}
                  onClick={() => setForm({ ...form, amount: String(outstanding) })}
                >
                  Full
                </Button>
              </Grid>
              <Grid item xs={6} sm={1.5}>
                <Button
                  fullWidth variant="contained" sx={{ borderRadius: 2 }}
                  disabled={saving || !(Number(form.amount) > 0)}
                  onClick={addPayment}
                >
                  Add
                </Button>
              </Grid>
            </Grid>
          </Stack>
        ) : (
          <Typography variant="body2" color="success.main" fontWeight={600}>
            This invoice is fully paid.
          </Typography>
        )}

        <Divider />

        <Stack spacing={1}>
          <Typography variant="subtitle2" fontWeight={700}>Payment History</Typography>
          {data?.payments?.length ? data.payments.map((payment) => (
            <Stack
              key={payment.id} direction="row" alignItems="center" justifyContent="space-between"
              sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}
            >
              <Box>
                <Typography variant="body2" fontWeight={700}>{currency(payment.amount)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {payment.paymentMethod}
                  {payment.referenceNumber ? ` • ${payment.referenceNumber}` : ''}
                  {' • '}{date(payment.paidAt)}
                </Typography>
              </Box>
              <Tooltip title="Remove payment">
                <IconButton type="button" size="small" color="error" onClick={() => removePayment(payment.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          )) : (
            <Typography variant="body2" color="text.secondary">No payments recorded yet.</Typography>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}
