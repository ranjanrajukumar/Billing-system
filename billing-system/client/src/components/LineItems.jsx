import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Button, Divider, Grid, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material';

// Numeric columns a document can ask for, beyond the always-present quantity.
const FIELD_LABELS = {
  rate: 'Rate',
  discount: 'Discount',
  gstPercent: 'GST %',
};

/**
 * Editable product line items, shared by the document pages (quotations,
 * challans, returns, purchases). `fields` picks which numeric columns show.
 */
export default function LineItems({ items, onChange, products, fields = ['rate', 'discount', 'gstPercent'], blank }) {
  const setItem = (index, patch) => onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const chooseProduct = (index, productId) => {
    const product = products.find((p) => String(p.id) === String(productId));
    setItem(index, {
      productId,
      ...(fields.includes('rate') ? { rate: product?.sellingPrice || 0 } : {}),
      ...(fields.includes('gstPercent') ? { gstPercent: product?.gstPercent || 0 } : {}),
    });
  };

  const addRow = () => onChange([...items, { ...blank }]);
  const removeRow = (index) => onChange(items.filter((_, i) => i !== index));

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2" fontWeight={700}>Line Items</Typography>
      {items.map((item, index) => (
        <Stack key={index} spacing={1.5}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField
                select fullWidth size="small" label="Product"
                value={item.productId || ''}
                onChange={(e) => chooseProduct(index, e.target.value)}
                InputLabelProps={{ shrink: true }}
              >
                <MenuItem value=""><em>Select product</em></MenuItem>
                {products.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.productName}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField
                fullWidth size="small" label="Qty" type="number"
                inputProps={{ min: 0, step: 'any' }}
                value={item.quantity ?? ''}
                onChange={(e) => setItem(index, { quantity: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            {fields.map((field) => (
              <Grid item xs={6} sm={2} key={field}>
                <TextField
                  fullWidth size="small" label={FIELD_LABELS[field] || field} type="number"
                  inputProps={{ min: 0, step: 'any' }}
                  value={item[field] ?? ''}
                  onChange={(e) => setItem(index, { [field]: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            ))}
            <Grid item xs={12} sm={1}>
              <IconButton
                size="small" color="error" onClick={() => removeRow(index)}
                disabled={items.length === 1}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Grid>
          </Grid>
          {index < items.length - 1 && <Divider />}
        </Stack>
      ))}
      <Button startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: 'flex-start' }}>
        Add Product
      </Button>
    </Stack>
  );
}
