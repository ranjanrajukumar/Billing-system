import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box, Button, IconButton, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';

/**
 * The line-item grid shared by every document that has products on it —
 * purchase orders, GRNs, transfers, adjustments, returns.
 *
 * Which columns appear is driven by `columns`, so one component covers a
 * transfer's single quantity and a GRN's received/accepted/rejected split
 * without either screen re-implementing add, remove and product selection.
 */
export default function DocumentLines({
  lines,
  onChange,
  products = [],
  columns,
  addLabel = 'Add Line',
  emptyLine = {},
  readOnly = false,
  footer = null,
}) {
  const update = (index, patch) => {
    const next = [...lines];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const add = () => onChange([...lines, { productId: '', ...emptyLine }]);
  const remove = (index) => onChange(lines.filter((_, i) => i !== index));

  /** Fills a line's defaults from the product the user just chose. */
  const chooseProduct = (index, productId) => {
    const product = products.find((p) => String(p.id) === String(productId));
    update(index, {
      productId,
      ...(product ? {
        rate: lines[index].rate || product.purchasePrice || 0,
        gstPercent: lines[index].gstPercent ?? product.gstPercent ?? 0,
        um: lines[index].um || product.primaryUnit || 'PCS',
        unitCost: lines[index].unitCost ?? product.purchasePrice ?? 0,
      } : {}),
    });
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>Product</TableCell>
              {columns.map((col) => (
                <TableCell key={col.key} align={col.align || 'right'} sx={{ fontWeight: 700, minWidth: col.width || 110 }}>
                  {col.label}
                </TableCell>
              ))}
              {!readOnly && <TableCell width={48} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line, index) => (
              <TableRow key={index} hover>
                <TableCell>
                  {readOnly ? (
                    <Typography variant="body2">
                      {line.Product?.productName
                        || products.find((p) => String(p.id) === String(line.productId))?.productName
                        || `#${line.productId}`}
                    </Typography>
                  ) : (
                    <TextField
                      select fullWidth size="small" value={line.productId || ''}
                      onChange={(e) => chooseProduct(index, e.target.value)}
                    >
                      <MenuItem value=""><em>Select product</em></MenuItem>
                      {products.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {p.productName}{p.sku ? ` (${p.sku})` : ''}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                </TableCell>

                {columns.map((col) => (
                  <TableCell key={col.key} align={col.align || 'right'}>
                    {col.render
                      ? col.render(line, index, update)
                      : readOnly || col.readOnly ? (
                        <Typography variant="body2">{line[col.key] ?? '—'}</Typography>
                      ) : (
                        <TextField
                          size="small"
                          type={col.type || 'number'}
                          value={line[col.key] ?? ''}
                          onChange={(e) => update(index, { [col.key]: e.target.value })}
                          inputProps={{ style: { textAlign: col.align === 'left' ? 'left' : 'right' }, ...col.inputProps }}
                          sx={{ width: col.width || 110 }}
                        />
                      )}
                  </TableCell>
                ))}

                {!readOnly && (
                  <TableCell>
                    <IconButton size="small" color="error" onClick={() => remove(index)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}

            {!lines.length && (
              <TableRow>
                <TableCell colSpan={columns.length + 2}>
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                    No lines yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      {(!readOnly || footer) && (
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, gap: 2, flexWrap: 'wrap' }}>
          {!readOnly
            ? <Button size="small" startIcon={<AddIcon />} onClick={add}>{addLabel}</Button>
            : <span />}
          {footer}
        </Stack>
      )}
    </Paper>
  );
}
