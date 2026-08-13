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
    const primaryUnit = product?.primaryUnit || 'PCS';
    setItem(index, {
      productId,
      um: primaryUnit,
      ...(fields.includes('rate') ? { rate: product?.sellingPrice || 0 } : {}),
      ...(fields.includes('gstPercent') ? { gstPercent: product?.gstPercent || 0 } : {}),
    });
  };

  const changeUnit = (index, unitCode) => {
    const item = items[index];
    const product = products.find((p) => String(p.id) === String(item.productId));
    let newRate = item.rate;
    if (product) {
      const primary = product.primaryUnit || 'PCS';
      const secondary = product.secondaryUnit || '';
      const factor = Number(product.unitConversionFactor || 1);
      if (unitCode === secondary && factor > 1) {
        newRate = product.secondarySellingPrice ? Number(product.secondarySellingPrice) : Number((product.sellingPrice / factor).toFixed(2));
      } else if (unitCode === primary) {
        newRate = Number(product.sellingPrice || 0);
      }
    }
    setItem(index, { um: unitCode, rate: newRate });
  };

  const addRow = () => onChange([...items, { ...blank }]);
  const removeRow = (index) => onChange(items.filter((_, i) => i !== index));

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2" fontWeight={700}>Line Items</Typography>
      {items.map((item, index) => (
        <Stack key={index} spacing={1.5}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={3.5}>
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
            <Grid item xs={6} sm={1.5}>
              <TextField
                fullWidth size="small" label="Qty" type="number"
                inputProps={{ min: 0, step: 'any' }}
                value={item.quantity ?? ''}
                onChange={(e) => setItem(index, { quantity: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={6} sm={1.5}>
              <TextField
                select fullWidth size="small" label="Unit"
                value={item.um || 'PCS'}
                onChange={(e) => changeUnit(index, e.target.value)}
                InputLabelProps={{ shrink: true }}
              >
                {(() => {
                  const p = products.find((p) => String(p.id) === String(item.productId));
                  const uList = [];
                  if (p?.primaryUnit) uList.push(p.primaryUnit);
                  if (p?.secondaryUnit && !uList.includes(p.secondaryUnit)) uList.push(p.secondaryUnit);
                  if (!uList.length) uList.push('PCS', 'KG', 'BOX', 'BAG');
                  return uList.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>);
                })()}
              </TextField>
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
              {/* This component is always rendered inside a <form>, and a
                  button with no type defaults to submit — which would save the
                  document instead of removing a row. */}
              <IconButton
                type="button"
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
      <Button type="button" startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: 'flex-start' }}>
        Add Product
      </Button>
    </Stack>
  );
}
