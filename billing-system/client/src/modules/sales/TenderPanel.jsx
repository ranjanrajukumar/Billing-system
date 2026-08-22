import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import {
  alpha, Box, Button, Divider, IconButton, MenuItem, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import { currency } from '../../utils/formatters.js';

/**
 * How the customer is paying.
 *
 * One row for the common case, more when they split it. Two numbers are worked
 * out here and neither is sent anywhere:
 *
 * **Change due** — what to count back out of the drawer. The tendered figure is
 * what the customer handed over, which is not what they paid: ₹500 for a ₹327
 * bill pays ₹327 and ₹173 goes straight back. Sending the tendered amount would
 * overstate the day's takings and the drawer by the change.
 *
 * **On account** — whatever the tenders do not cover. Credit is not a way of
 * paying, it is the gap left when the paying stops, so it is shown rather than
 * chosen. A cashier who wants a pure credit sale clears the amount.
 */

const TENDER_METHODS = ['Cash', 'Card', 'UPI', 'Bank Transfer'];

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Only the rows with money on them. This is what the server is sent. */
const usedTenders = (tenders = []) => tenders
  .filter((t) => Number(t.amount) > 0)
  .map((t) => ({
    paymentMethod: t.paymentMethod,
    amount: money(t.amount),
    referenceNumber: t.referenceNumber || null,
  }));

const tenderTotal = (tenders = []) => money(
  usedTenders(tenders).reduce((sum, t) => sum + t.amount, 0),
);

export default function TenderPanel({ total, tenders, onChange, tendered, onTendered }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const paid = tenderTotal(tenders);
  const onAccount = money(total - paid);
  const overpaid = paid > total + 0.009;
  const takingCash = tenders.some((t) => t.paymentMethod === 'Cash' && Number(t.amount) > 0);
  const change = Math.max(0, money(tendered) - paid);

  const update = (index, patch) => onChange(
    tenders.map((t, i) => (i === index ? { ...t, ...patch } : t)),
  );

  const addRow = () => {
    // The new row is offered whatever is still outstanding, which is almost
    // always what it is about to be used for.
    const remaining = Math.max(0, onAccount);
    const unused = TENDER_METHODS.find((m) => !tenders.some((t) => t.paymentMethod === m));
    onChange([...tenders, {
      paymentMethod: unused || 'Cash',
      amount: remaining > 0 ? String(remaining) : '',
    }]);
  };

  const line = (label, value, { strong = false, tone = null } = {}) => (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
      <Typography variant={strong ? 'subtitle2' : 'body2'} color={strong ? 'text.primary' : 'text.secondary'} fontWeight={strong ? 700 : 400}>
        {label}
      </Typography>
      <Typography variant={strong ? 'subtitle1' : 'body2'} fontWeight={strong ? 800 : 600} color={tone || 'text.primary'}>
        {currency(value)}
      </Typography>
    </Stack>
  );

  return (
    <Stack spacing={1.25}>
      {tenders.map((tender, index) => (
        <Stack key={index} direction="row" spacing={1} alignItems="center">
          <TextField
            select size="small" sx={{ width: 132 }} value={tender.paymentMethod}
            onChange={(e) => update(index, { paymentMethod: e.target.value })}
          >
            {TENDER_METHODS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </TextField>
          <TextField
            size="small" type="number" fullWidth placeholder="0.00"
            value={tender.amount}
            inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' } }}
            onChange={(e) => update(index, { amount: e.target.value })}
          />
          {tenders.length > 1 && (
            <IconButton size="small" onClick={() => onChange(tenders.filter((_, i) => i !== index))}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      ))}

      {tenders.length < TENDER_METHODS.length && (
        <Button size="small" startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: 'flex-start' }}>
          Split payment
        </Button>
      )}

      <Divider />
      {line('Paid', paid)}
      {onAccount > 0 && line('On account', onAccount, { tone: theme.palette.warning.main })}
      {overpaid && (
        <Typography variant="caption" color="error.main">
          That is more than the bill. Enter what is being kept — the change is worked out below.
        </Typography>
      )}

      {takingCash && (
        <>
          <Divider />
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Cash tendered</Typography>
            <TextField
              size="small" type="number" sx={{ width: 130 }} placeholder="0.00"
              value={tendered}
              inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' } }}
              onChange={(e) => onTendered(e.target.value)}
            />
          </Stack>
          {/* The only number on this panel the cashier acts on physically, so
              it is the loudest thing here when there is any. */}
          <Box
            sx={{
              px: 1.5, py: 1, borderRadius: 1.5,
              bgcolor: change > 0
                ? alpha(theme.palette.success.main, isDark ? 0.16 : 0.1)
                : alpha(theme.palette.text.primary, isDark ? 0.06 : 0.035),
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.08em' }}>
                CHANGE DUE
              </Typography>
              <Typography
                sx={{ fontWeight: 800, fontSize: '1.35rem', lineHeight: 1.2 }}
                color={change > 0 ? 'success.main' : 'text.disabled'}
              >
                {change > 0 ? currency(change) : '—'}
              </Typography>
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}
