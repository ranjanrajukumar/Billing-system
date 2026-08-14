import PersonAddIcon from '@mui/icons-material/PersonAdd';
import {
  alpha, Box, Button, Checkbox, FormControlLabel, Grid, MenuItem,
  Paper, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import { useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { customersApi } from '../services/resource.service.js';

/**
 * Choose a customer, or tick the box and add one without leaving the bill.
 *
 * A customer who is not yet on file is the normal case at a counter, and
 * sending the cashier to the Customers screen to create one means abandoning a
 * half-built bill. The new customer is saved immediately rather than as part of
 * the invoice, so a duplicate mobile or a bad email is reported on its own
 * terms instead of failing the sale.
 *
 * State matters more than it looks: it decides CGST/SGST versus IGST, so it is
 * asked for here rather than left to be corrected after the bill is printed.
 */
const PRICE_TIERS = ['Retail', 'Wholesale', 'Dealer'];

const blank = {
  customerName: '', mobileNumber: '', state: '', gstNumber: '', priceTier: 'Retail',
};

export default function CustomerPicker({
  customers = [],
  value,
  onChange,
  onCustomerCreated,
  label = 'Customer',
  required = true,
  disabled = false,
  inputId,
  defaultState = '',
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const theme = useTheme();

  const openAdd = (checked) => {
    setAdding(checked);
    // The company's own state is the common case for a walk-in, so it is
    // prefilled rather than left blank for the cashier to guess at.
    if (checked) setForm({ ...blank, state: defaultState });
  };

  const save = async () => {
    if (!form.customerName.trim() || !form.mobileNumber.trim()) {
      showToast('A name and a mobile number are needed', 'error');
      return;
    }

    setSaving(true);
    try {
      const created = await customersApi.create({
        ...form,
        customerName: form.customerName.trim(),
        mobileNumber: form.mobileNumber.trim(),
      });
      showToast(`${created.customerName} added`);
      // Hand the new customer back so the caller can refresh its list, then
      // select them — the whole point is to carry straight on with the bill.
      await onCustomerCreated?.(created);
      onChange?.(created.id);
      setAdding(false);
      setForm(blank);
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not add the customer', 'error');
    }
    setSaving(false);
  };

  return (
    <Stack spacing={1}>
      <TextField
        fullWidth select id={inputId} label={label}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled || adding}
        required={required}
        InputLabelProps={{ shrink: true }}
        helperText={adding ? 'Finish adding the new customer below' : ' '}
      >
        <MenuItem value=""><em>Select a customer</em></MenuItem>
        {customers.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.customerName}{c.mobileNumber ? ` · ${c.mobileNumber}` : ''}
          </MenuItem>
        ))}
      </TextField>

      <FormControlLabel
        sx={{ ml: 0 }}
        control={
          <Checkbox
            size="small"
            checked={adding}
            disabled={disabled}
            onChange={(e) => openAdd(e.target.checked)}
          />
        }
        label={
          <Stack direction="row" spacing={0.75} alignItems="center">
            <PersonAddIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography variant="body2" fontWeight={600}>New customer</Typography>
          </Stack>
        }
      />

      {adding && (
        <Paper
          variant="outlined"
          sx={{ p: 2, borderRadius: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.03) }}
        >
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Name" autoFocus
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Mobile"
                value={form.mobileNumber}
                onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth size="small" label="State"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                InputLabelProps={{ shrink: true }}
                helperText="Decides CGST/SGST or IGST"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth size="small" label="GST Number (optional)"
                value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth select size="small" label="Price tier"
                value={form.priceTier}
                onChange={(e) => setForm({ ...form, priceTier: e.target.value })}
                InputLabelProps={{ shrink: true }}
                helperText="Which price they pay"
              >
                {PRICE_TIERS.map((tier) => <MenuItem key={tier} value={tier}>{tier}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="small" variant="outlined" sx={{ borderRadius: 2 }}
                  onClick={() => { setAdding(false); setForm(blank); }}
                >
                  Cancel
                </Button>
                <Button
                  size="small" variant="contained" sx={{ borderRadius: 2 }}
                  disabled={saving || !form.customerName.trim() || !form.mobileNumber.trim()}
                  onClick={save}
                >
                  {saving ? 'Saving…' : 'Save & Use'}
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </Paper>
      )}
    </Stack>
  );
}
