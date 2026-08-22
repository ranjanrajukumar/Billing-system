import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  alpha, Alert, Box, Button, Chip, Divider, IconButton, Stack, Switch,
  FormControlLabel, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import Loader from '../../components/Loader.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { packagingApi } from '../../services/resource.service.js';
import { currency } from '../../utils/formatters.js';

/**
 * The two ways one product comes in more than one size.
 *
 * They look alike on screen and they are not the same thing, so the panel keeps
 * them apart and says why:
 *
 * A **unit** is how the same pile is counted. A bucket is ten kilos of the same
 * loose stock — one balance, counted differently depending on who is asking.
 * Buying five buckets adds fifty kilos; there is nothing on a shelf called a
 * bucket.
 *
 * A **pack** is a sealed thing with its own barcode, its own price and its own
 * balance. A hundred 100g pouches is not the same as 10kg loose: selling a
 * pouch must not decrement the loose stock, and it does not.
 *
 * Getting that distinction wrong is the expensive kind of wrong — a pack
 * modelled as a unit silently sells sealed goods out of an open sack.
 */

const blankUnit = { unitCode: '', factorToBase: '', canSell: true, canPurchase: true };
const blankPack = { variantName: '', packSize: '', sku: '', barcode: '', sellingPrice: '' };

/** Where a unit came from, and whether this panel may edit it. */
function SourceChip({ source }) {
  const theme = useTheme();
  if (source === 'product_uoms') return null;

  const label = source === 'base-default' ? 'implied base' : 'from the old fields';
  const hint = source === 'base-default'
    ? 'No row was configured, so the product’s base unit is offered anyway'
    : 'Read from the product’s secondary-unit fields. Add it as a unit below to edit it here.';

  return (
    <Tooltip title={hint}>
      <Chip
        size="small"
        icon={<LockOutlinedIcon sx={{ fontSize: 13 }} />}
        label={label}
        sx={{
          height: 20,
          fontSize: '0.68rem',
          bgcolor: alpha(theme.palette.info.main, 0.1),
          color: 'info.main',
        }}
      />
    </Tooltip>
  );
}

export default function UnitsAndPacks({ product }) {
  const theme = useTheme();
  const { showToast } = useToast();

  const [units, setUnits] = useState([]);
  const [baseUnit, setBaseUnit] = useState('');
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newUnit, setNewUnit] = useState(blankUnit);
  const [newPack, setNewPack] = useState(blankPack);

  const load = useCallback(async () => {
    if (!product?.id) return;
    setLoading(true);
    try {
      const [unitTable, packRows] = await Promise.all([
        packagingApi.units.list(product.id),
        packagingApi.packs.list(product.id),
      ]);
      setUnits(unitTable.units || []);
      setBaseUnit(unitTable.baseUnit || '');
      setPacks(packRows || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not load units and packs', 'error');
    }
    setLoading(false);
  }, [product?.id, showToast]);

  useEffect(() => { load(); }, [load]);

  const addUnit = async () => {
    if (!newUnit.unitCode.trim()) { showToast('Give the unit a code, such as BOX', 'error'); return; }
    if (!(Number(newUnit.factorToBase) > 0)) {
      showToast(`How many ${baseUnit || 'base units'} are in one ${newUnit.unitCode.toUpperCase()}?`, 'error');
      return;
    }
    setBusy(true);
    try {
      await packagingApi.units.save(product.id, {
        ...newUnit,
        unitCode: newUnit.unitCode.trim().toUpperCase(),
        factorToBase: Number(newUnit.factorToBase),
      });
      showToast(`1 ${newUnit.unitCode.toUpperCase()} = ${newUnit.factorToBase} ${baseUnit}`);
      setNewUnit(blankUnit);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the unit', 'error');
    }
    setBusy(false);
  };

  const addPack = async () => {
    if (!newPack.variantName.trim()) { showToast('Give the pack a name, such as “100g pouch”', 'error'); return; }
    setBusy(true);
    try {
      await packagingApi.packs.create(product.id, {
        ...newPack,
        packSize: newPack.packSize ? Number(newPack.packSize) : null,
        packUnitCode: baseUnit || null,
        sellingPrice: newPack.sellingPrice ? Number(newPack.sellingPrice) : null,
      });
      showToast(`${newPack.variantName} added`);
      setNewPack(blankPack);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the pack', 'error');
    }
    setBusy(false);
  };

  const removeUnit = async (unit) => {
    setBusy(true);
    try {
      await packagingApi.units.remove(product.id, unit.id);
      showToast(`${unit.unitCode} removed`);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove the unit', 'error');
    }
    setBusy(false);
  };

  const removePack = async (pack) => {
    setBusy(true);
    try {
      await packagingApi.packs.remove(product.id, pack.id);
      showToast(`${pack.variantName} removed`);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove the pack', 'error');
    }
    setBusy(false);
  };

  if (loading) return <Loader rows={3} />;

  const cell = { fontSize: '0.85rem' };
  const headCell = {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'text.disabled',
  };

  return (
    <Stack spacing={3}>
      {/* ---------------- Units ---------------- */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700}>Units</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          How the same stock is counted. Buying 5 BOX of something whose factor is 10 adds
          50 {baseUnit || 'units'} — there is one balance, counted differently.
        </Typography>

        <Box sx={{ mt: 1.5, border: `1px solid ${theme.palette.divider}`, borderRadius: 1.5, overflow: 'hidden' }}>
          <Stack
            direction="row" spacing={1.5}
            sx={{ px: 1.5, py: 0.9, bgcolor: alpha(theme.palette.text.primary, 0.03) }}
          >
            <Typography sx={{ ...headCell, flex: 1 }}>Unit</Typography>
            <Typography sx={{ ...headCell, width: 130, textAlign: 'right' }}>1 unit = ? {baseUnit}</Typography>
            <Typography sx={{ ...headCell, width: 92 }}>Sell / Buy</Typography>
            <Box sx={{ width: 34 }} />
          </Stack>

          {units.map((unit) => {
            const editable = unit.source === 'product_uoms' && !unit.isBase;
            return (
              <Stack
                key={unit.unitCode}
                direction="row" spacing={1.5} alignItems="center"
                sx={{ px: 1.5, py: 1, borderTop: `1px solid ${theme.palette.divider}` }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ ...cell, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
                    {unit.unitCode}
                  </Typography>
                  {unit.isBase && (
                    <Chip
                      size="small" label="base"
                      sx={{ height: 20, fontSize: '0.68rem', bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}
                    />
                  )}
                  <SourceChip source={unit.source} />
                </Stack>
                <Typography sx={{ ...cell, width: 130, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(unit.factorToBase).toLocaleString('en-IN')}
                </Typography>
                <Typography sx={{ ...cell, width: 92, color: 'text.secondary' }}>
                  {unit.canSell ? 'Sell' : '—'} / {unit.canPurchase ? 'Buy' : '—'}
                </Typography>
                <Box sx={{ width: 34, display: 'flex', justifyContent: 'center' }}>
                  {editable ? (
                    <IconButton size="small" disabled={busy} onClick={() => removeUnit(unit)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  ) : (
                    <Tooltip title={unit.isBase
                      ? 'The base unit cannot be removed — every balance is held in it'
                      : 'Not editable here'}>
                      <LockOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
                    </Tooltip>
                  )}
                </Box>
              </Stack>
            );
          })}

          <Stack
            direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}
            sx={{ px: 1.5, py: 1.25, borderTop: `1px solid ${theme.palette.divider}`, bgcolor: alpha(theme.palette.text.primary, 0.02) }}
          >
            <TextField
              size="small" label="Unit code" placeholder="BOX" sx={{ width: 130 }}
              value={newUnit.unitCode}
              onChange={(e) => setNewUnit({ ...newUnit, unitCode: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small" type="number" sx={{ width: 170 }}
              label={`1 unit = ? ${baseUnit || 'base'}`}
              value={newUnit.factorToBase}
              onChange={(e) => setNewUnit({ ...newUnit, factorToBase: e.target.value })}
              inputProps={{ min: 0, step: 'any' }}
              InputLabelProps={{ shrink: true }}
            />
            <FormControlLabel
              control={<Switch size="small" checked={newUnit.canSell} onChange={(e) => setNewUnit({ ...newUnit, canSell: e.target.checked })} />}
              label={<Typography variant="body2">Can sell</Typography>}
            />
            <FormControlLabel
              control={<Switch size="small" checked={newUnit.canPurchase} onChange={(e) => setNewUnit({ ...newUnit, canPurchase: e.target.checked })} />}
              label={<Typography variant="body2">Can buy</Typography>}
            />
            <Button size="small" startIcon={<AddIcon />} disabled={busy} onClick={addUnit}>Add unit</Button>
          </Stack>
        </Box>

        {/* The one mistake this screen exists to prevent. */}
        <Alert severity="info" sx={{ mt: 1.25, py: 0.4 }}>
          A unit with no real conversion looks like a working setup while billing the wrong
          quantity. A purchase-only unit — a bucket you buy in but never sell — is what
          <strong> Can sell </strong> is for.
        </Alert>
      </Box>

      <Divider />

      {/* ---------------- Packs ---------------- */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700}>Packs</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Sealed sizes with their own barcode, price and stock. A hundred 100g pouches is not
          the same as 10 kg loose, and selling one does not touch the other.
        </Typography>

        <Box sx={{ mt: 1.5, border: `1px solid ${theme.palette.divider}`, borderRadius: 1.5, overflow: 'hidden' }}>
          <Stack
            direction="row" spacing={1.5}
            sx={{ px: 1.5, py: 0.9, bgcolor: alpha(theme.palette.text.primary, 0.03) }}
          >
            <Typography sx={{ ...headCell, flex: 1 }}>Pack</Typography>
            <Typography sx={{ ...headCell, width: 110, textAlign: 'right' }}>Size</Typography>
            <Typography sx={{ ...headCell, width: 130 }}>SKU / barcode</Typography>
            <Typography sx={{ ...headCell, width: 100, textAlign: 'right' }}>Price</Typography>
            <Box sx={{ width: 34 }} />
          </Stack>

          {!packs.length && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1.5, borderTop: `1px solid ${theme.palette.divider}` }}>
              No packs. This product is sold loose, by unit.
            </Typography>
          )}

          {packs.map((pack) => (
            <Stack
              key={pack.id}
              direction="row" spacing={1.5} alignItems="center"
              sx={{ px: 1.5, py: 1, borderTop: `1px solid ${theme.palette.divider}` }}
            >
              <Typography sx={{ ...cell, flex: 1, fontWeight: 600 }}>{pack.variantName}</Typography>
              <Typography sx={{ ...cell, width: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {pack.packSize ? `${Number(pack.packSize).toLocaleString('en-IN')} ${pack.packUnitCode || baseUnit}` : '—'}
              </Typography>
              <Box sx={{ width: 130 }}>
                <Typography sx={{ ...cell, fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }}>
                  {pack.sku || '—'}
                </Typography>
                {pack.barcode && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'ui-monospace, monospace' }}>
                    {pack.barcode}
                  </Typography>
                )}
              </Box>
              <Typography sx={{ ...cell, width: 100, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {pack.sellingPrice ? currency(pack.sellingPrice) : '—'}
              </Typography>
              <Box sx={{ width: 34, display: 'flex', justifyContent: 'center' }}>
                <IconButton size="small" disabled={busy} onClick={() => removePack(pack)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Stack>
          ))}

          <Stack
            direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}
            sx={{ px: 1.5, py: 1.25, borderTop: `1px solid ${theme.palette.divider}`, bgcolor: alpha(theme.palette.text.primary, 0.02), flexWrap: 'wrap' }}
          >
            <TextField
              size="small" label="Pack name" placeholder="100g pouch" sx={{ width: 150 }}
              value={newPack.variantName}
              onChange={(e) => setNewPack({ ...newPack, variantName: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small" type="number" sx={{ width: 120 }}
              label={`Size in ${baseUnit || 'base'}`}
              value={newPack.packSize}
              onChange={(e) => setNewPack({ ...newPack, packSize: e.target.value })}
              inputProps={{ min: 0, step: 'any' }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small" label="SKU" sx={{ width: 120 }}
              value={newPack.sku}
              onChange={(e) => setNewPack({ ...newPack, sku: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small" label="Barcode" sx={{ width: 140 }}
              value={newPack.barcode}
              onChange={(e) => setNewPack({ ...newPack, barcode: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small" type="number" label="Price" sx={{ width: 110 }}
              value={newPack.sellingPrice}
              onChange={(e) => setNewPack({ ...newPack, sellingPrice: e.target.value })}
              inputProps={{ min: 0, step: 'any' }}
              InputLabelProps={{ shrink: true }}
            />
            <Button size="small" startIcon={<AddIcon />} disabled={busy} onClick={addPack}>Add pack</Button>
          </Stack>
        </Box>
      </Box>
    </Stack>
  );
}
