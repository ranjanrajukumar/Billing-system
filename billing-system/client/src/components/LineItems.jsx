import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box, Button, Divider, Grid, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import SearchableSelect from './SearchableSelect.jsx';
import { formatPackage, formatProductOption } from '../utils/productFormatters.js';

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
export default function LineItems({ items, onChange, products, fields = ['rate', 'discount', 'gstPercent'], showBatchFields = false, blank }) {
  const setItem = (index, patch) => onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const chooseProduct = (index, productId) => {
    const product = products.find((p) => String(p.id) === String(productId));
    const primaryUnit = product?.primaryUnit || 'PCS';
    const rateToUse = fields.includes('rate')
      ? (showBatchFields ? Number(product?.purchasePrice || 0) : Number(product?.sellingPrice || 0))
      : 0;
    const pkg = formatPackage(product);
    setItem(index, {
      productId,
      um: primaryUnit,
      packing: pkg || '',
      ...(fields.includes('rate') ? { rate: rateToUse } : {}),
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
      const basePrice = showBatchFields ? Number(product.purchasePrice || 0) : Number(product.sellingPrice || 0);

      if (unitCode === secondary && factor > 1) {
        newRate = (!showBatchFields && product.secondarySellingPrice)
          ? Number(product.secondarySellingPrice)
          : Number((basePrice / factor).toFixed(2));
      } else if (unitCode === primary) {
        newRate = basePrice;
      }
    }
    setItem(index, { um: unitCode, rate: newRate });
  };

  const addRow = () => onChange([...items, { ...blank }]);
  const removeRow = (index) => onChange(items.filter((_, i) => i !== index));

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2" fontWeight={700}>Line Items</Typography>
      {items.map((item, index) => {
        const product = products.find((p) => String(p.id) === String(item.productId));
        const primary = product?.primaryUnit || 'PCS';
        const secondary = product?.secondaryUnit || '';
        const factor = Number(product?.unitConversionFactor || 1);
        const billedUnit = item.um || primary;
        const isSecondary = billedUnit === secondary && factor > 1;
        const primaryQty = isSecondary ? Number(item.quantity || 0) * factor : Number(item.quantity || 0);
        const pkg = formatPackage(product);

        return (
          <Stack key={index} spacing={1} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Grid container spacing={1.5} alignItems="center">
              <Grid item xs={12} sm={3}>
                <SearchableSelect
                  options={products}
                  label="Product"
                  value={products.find(p => String(p.id) === String(item.productId)) || null}
                  onChange={(selectedOption) => chooseProduct(index, selectedOption ? selectedOption.id : '')}
                  getOptionLabel={(option) => formatProductOption(option)}
                  getOptionKey={(option) => option.id}
                  size="small"
                />
                {product && (
                  <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {pkg && (
                      <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, bgcolor: 'action.hover', px: 0.75, py: 0.25, borderRadius: 1 }}>
                        Pkg: {pkg}
                      </Typography>
                    )}
                    {product.sku && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.75, py: 0.25, borderRadius: 1 }}>
                        SKU: {product.sku}
                      </Typography>
                    )}
                  </Box>
                )}
              </Grid>
              <Grid item xs={6} sm={1}>
                <TextField
                  fullWidth size="small" label="Qty" type="number"
                  inputProps={{ min: 0, step: 'any' }}
                  value={item.quantity ?? ''}
                  onChange={(e) => setItem(index, { quantity: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6} sm={1}>
                <TextField
                  select fullWidth size="small" label="Unit"
                  value={item.um || 'PCS'}
                  onChange={(e) => changeUnit(index, e.target.value)}
                  InputLabelProps={{ shrink: true }}
                >
                  {(() => {
                    const uList = [];
                    if (product?.primaryUnit) uList.push(product.primaryUnit);
                    if (product?.secondaryUnit && !uList.includes(product.secondaryUnit)) uList.push(product.secondaryUnit);
                    if (!uList.length) uList.push('PCS', 'KG', 'GM', 'BOX', 'BAG');
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
              <Grid item xs={12} sm={1} display="flex" justifyContent="center">
                <IconButton
                  type="button"
                  size="small" color="error" onClick={() => removeRow(index)}
                  disabled={items.length === 1}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Grid>
            </Grid>

            {/* Conversion Helper Banner */}
            {isSecondary && (
              <Typography variant="caption" color="primary.main" fontWeight={600} sx={{ ml: 1 }}>
                ℹ Conversion: {item.quantity} {billedUnit} = {primaryQty} {primary} (Factor: 1 {billedUnit} = {factor} {primary})
              </Typography>
            )}

            {/* Optional Seed Lot / Batch Information for PO Purchases */}
            {showBatchFields && item.productId && (
              <Grid container spacing={1.5} sx={{ mt: 0.5, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth size="small" label="Seed Lot / Batch #"
                    placeholder="e.g. LOT-2026-X"
                    value={item.batchNumber || ''}
                    onChange={(e) => setItem(index, { batchNumber: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField
                    fullWidth size="small" label="Germination %" type="number"
                    placeholder="e.g. 98"
                    inputProps={{ min: 0, max: 100, step: 'any' }}
                    value={item.germinationPercent || ''}
                    onChange={(e) => setItem(index, { germinationPercent: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField
                    fullWidth size="small" label="Expiry / Validity Date" type="date"
                    value={item.expiryDate || ''}
                    onChange={(e) => setItem(index, { expiryDate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
            )}
          </Stack>
        );
      })}
      <Button type="button" startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: 'flex-start' }}>
        Add Product
      </Button>
    </Stack>
  );
}
