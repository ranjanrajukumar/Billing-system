import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box, Button, Divider, Grid, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import SearchableSelect from './SearchableSelect.jsx';
import { formatPackage, formatProductOption } from '../utils/productFormatters.js';
import { packagingApi } from '../services/resource.service.js';

/**
 * What a product can be sold as: its packs, then its units.
 *
 * The dropdown carries both because the choice is genuinely one choice — the
 * seller picks "100g pouch" or "KG" from the same list — while the two mean
 * different things underneath. A pack sets `variantId` and comes off its own
 * balance; a unit clears it and converts against the loose pile.
 *
 * Encoded as `pack:<id>` / `unit:<CODE>` so the two namespaces cannot collide:
 * a pack named "KG" and a unit called KG are different things and must not
 * resolve to each other.
 */
const PACK = 'pack:';
const UNIT = 'unit:';

// Numeric columns a document can ask for, beyond the always-present quantity.
const FIELD_LABELS = {
  rate: 'Rate',
  discount: 'Discount',
  gstPercent: 'GST %',
};

/**
 * Whether a line is finished.
 *
 * A product and a quantity above zero, and nothing else: rate can legitimately
 * be zero on a free-of-charge line, and discount and GST are frequently blank.
 * Exported so a page refuses to save on the same rule the grid shows in red,
 * rather than each screen inventing its own idea of a complete line.
 */
export function incompleteLines(items = []) {
  return items.filter((item) => !item.productId || !(Number(item.quantity) > 0));
}

/**
 * Editable product line items, shared by the document pages (quotations,
 * challans, returns, purchases). `fields` picks which numeric columns show.
 *
 * `showErrors` is set once the user has tried to save. Before that a freshly
 * added blank row is not a mistake, it is a row waiting to be typed into, and a
 * form that opens already shouting is one people learn to ignore.
 */
export default function LineItems({
  items, onChange, products,
  fields = ['rate', 'discount', 'gstPercent'],
  showBatchFields = false,
  blank,
  showErrors = false,
  // ---- Optional, and off unless a page asks. Everything below exists so the
  // invoice screen could stop keeping a second copy of this component; a page
  // that passes none of it behaves exactly as it did before. ----
  /** `{ [productId]: lot[] }`. A lot picker appears for products that have any. */
  lots = null,
  /** Called when a product is chosen, so the page can go and fetch its lots. */
  onProductChosen = null,
  /** An editable packing description on each line. */
  showPacking = false,
  /** `(item) => number`. Renders a per-line total when given. */
  lineTotal = null,
  /** `(product) => boolean`. Greys a product out — out of stock, usually. */
  productDisabled = null,
  /** `(product) => string`. A second caption line under the product name. */
  productMeta = null,
}) {
  const setItem = (index, patch) => onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  // What each product on the document can be sold as, fetched once per product
  // and kept for as long as the form is open.
  const [sellOptions, setSellOptions] = useState({});

  useEffect(() => {
    const wanted = [...new Set(items.map((i) => i.productId).filter(Boolean))]
      .filter((id) => !(id in sellOptions));
    if (!wanted.length) return;

    let live = true;
    Promise.all(wanted.map(async (id) => {
      // A product with no packs and no units still answers; a failure here
      // just means the line falls back to the plain unit list below.
      try { return [id, await packagingApi.sellOptions(id)]; } catch { return [id, null]; }
    })).then((pairs) => {
      if (live) setSellOptions((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => { live = false; };
  }, [items, sellOptions]);

  /** Applies whichever of the two the seller picked. */
  const chooseSellAs = (index, value, product) => {
    if (value.startsWith(PACK)) {
      const id = Number(value.slice(PACK.length));
      const pack = sellOptions[product?.id]?.packaged?.find((p) => p.variantId === id);
      setItem(index, {
        variantId: id,
        um: pack?.name || '',
        // A pack carries its own price; falling back to the loose rate would
        // bill a sealed pouch at the price of its contents.
        ...(pack?.price != null ? { rate: pack.price } : {}),
      });
      return;
    }
    setItem(index, { variantId: null });
    changeUnit(index, value.slice(UNIT.length));
  };

  const chooseProduct = (index, productId) => {
    const product = products.find((p) => String(p.id) === String(productId));
    const primaryUnit = product?.primaryUnit || 'PCS';
    const rateToUse = fields.includes('rate')
      ? (showBatchFields ? Number(product?.purchasePrice || 0) : Number(product?.sellingPrice || 0))
      : 0;
    const pkg = formatPackage(product);
    setItem(index, {
      productId,
      // Cleared, because a pack belongs to one product. Changing the product
      // while keeping the pack leaves the line pointing at a pack of something
      // else, which the server refuses — after the seller has typed the rest
      // of the line.
      variantId: null,
      // The lot belongs to the old product too.
      batchId: '',
      um: primaryUnit,
      packing: pkg || '',
      ...(fields.includes('rate') ? { rate: rateToUse } : {}),
      ...(fields.includes('gstPercent') ? { gstPercent: product?.gstPercent || 0 } : {}),
    });
    onProductChosen?.(productId);
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
                  required
                  error={showErrors && !item.productId}
                  {...(productDisabled ? { getOptionDisabled: productDisabled } : {})}
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
                    {productMeta?.(product) && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', bgcolor: 'action.hover', px: 0.75, py: 0.25, borderRadius: 1 }}>
                        {productMeta(product)}
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
                  required
                  error={showErrors && !(Number(item.quantity) > 0)}
                  onChange={(e) => setItem(index, { quantity: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6} sm={1}>
                <TextField
                  select fullWidth size="small"
                  label={sellOptions[product?.id]?.packaged?.length ? 'Sell as' : 'Unit'}
                  value={item.variantId ? `${PACK}${item.variantId}` : `${UNIT}${item.um || primary}`}
                  onChange={(e) => chooseSellAs(index, e.target.value, product)}
                  InputLabelProps={{ shrink: true }}
                >
                  {(() => {
                    const options = sellOptions[product?.id];
                    const out = [];
                    const known = (options?.packaged || []).some((p) => p.variantId === item.variantId);

                    // A saved pack whose options have not arrived yet.
                    //
                    // Without this the select is handed a value with no
                    // matching option, renders blank, and the first touch of
                    // the row resolves it to a unit — quietly turning a pack
                    // sale into loose stock on save. Reopening an invoice must
                    // never do that, so the line's own pack is offered from
                    // what the line already knows.
                    if (item.variantId && !known) {
                      out.push(
                        <MenuItem key={`${PACK}${item.variantId}`} value={`${PACK}${item.variantId}`}>
                          {item.um || 'Pack'}
                        </MenuItem>,
                      );
                    }

                    // Packs first: they are the specific thing, and a seller
                    // reaching for "100g pouch" should not scroll past GM.
                    for (const pack of options?.packaged || []) {
                      out.push(
                        <MenuItem key={`${PACK}${pack.variantId}`} value={`${PACK}${pack.variantId}`}>
                          {pack.name}{pack.packSize ? ` · ${pack.packSize}${pack.packUnitCode || ''}` : ''}
                        </MenuItem>,
                      );
                    }

                    const units = options?.bulk?.length
                      ? options.bulk.map((u) => u.unitCode)
                      : [product?.primaryUnit, product?.secondaryUnit].filter(Boolean);
                    const list = units.length ? units : ['PCS', 'KG', 'GM', 'BOX', 'BAG'];

                    for (const code of [...new Set(list)]) {
                      out.push(
                        <MenuItem key={`${UNIT}${code}`} value={`${UNIT}${code}`}>{code}</MenuItem>,
                      );
                    }
                    return out;
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
              {showPacking && (
                <Grid item xs={6} sm={1.5}>
                  <TextField
                    fullWidth size="small" label="Packing" placeholder="1 KG"
                    value={item.packing || ''}
                    onChange={(e) => setItem(index, { packing: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              )}
              {lineTotal && (
                <Grid item xs={6} sm={1.5}>
                  <Box sx={{ px: 1, py: 0.75, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Total</Typography>
                    <Typography fontWeight={700} color="primary.main" fontSize="0.85rem">
                      {lineTotal(item)}
                    </Typography>
                  </Box>
                </Grid>
              )}
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

            {/* Choosing an existing lot to sell from. Distinct from the block
                below, which records a new lot arriving on a purchase. */}
            {lots?.[item.productId]?.length > 0 && (
              <Grid container spacing={1} sx={{ mt: 0.25 }}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth select size="small" label="Seed lot"
                    value={item.batchId || ''}
                    onChange={(e) => setItem(index, { batchId: e.target.value })}
                    helperText="Leave blank to use the lot expiring soonest"
                    InputLabelProps={{ shrink: true }}
                  >
                    <MenuItem value="">Automatic (first to expire)</MenuItem>
                    {lots[item.productId].map((b) => (
                      <MenuItem key={b.id} value={b.id}>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {b.batchNumber}{b.status === 'Expiring' ? ' — expiring soon' : ''}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {b.quantity} available
                            {b.germinationPercent != null ? ` · germ ${Number(b.germinationPercent).toFixed(0)}%` : ''}
                            {b.expiryDate ? ` · valid to ${b.expiryDate}` : ''}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
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
