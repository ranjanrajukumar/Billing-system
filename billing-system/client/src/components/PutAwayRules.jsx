import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RuleIcon from '@mui/icons-material/Rule';
import {
  Alert, Box, Button, Chip, Grid, IconButton, MenuItem, Paper, Stack, Switch,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Loader from './Loader.jsx';
import Modal from './Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { categoriesApi, productsApi, warehouseOpsApi } from '../services/resource.service.js';

/**
 * Rules for where arriving stock should be stored.
 *
 * Without them, every receipt is a decision made by whoever is holding the
 * trolley — which is how cold goods end up on a normal shelf and fast movers
 * end up at the back of the building.
 *
 * Rules only ever *suggest*. Put-away still lets the storeman choose, because a
 * rule that points at a full bin should not stop the goods being recorded.
 */
const CLASS_HINTS = {
  Standard: 'Nothing special — most products',
  FastMoving: 'Sells constantly; keep it near dispatch',
  Heavy: 'Needs ground level',
  Cold: 'Must go to cold storage',
  Hazardous: 'Needs a segregated zone',
  Fragile: 'Keep off high racking',
};

export default function PutAwayRules({ branchId, bins = [] }) {
  const [rules, setRules] = useState([]);
  const [matchTypes, setMatchTypes] = useState([]);
  const [storageClasses, setStorageClasses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [result, cats, prods] = await Promise.all([
        warehouseOpsApi.rules({ branchId }),
        categoriesApi.list({ limit: 200 }).catch(() => ({ data: [] })),
        productsApi.list({ limit: 300 }).catch(() => ({ data: [] })),
      ]);
      setRules(result.rules || []);
      setMatchTypes(result.matchTypes || []);
      setStorageClasses(result.storageClasses || []);
      setCategories(cats?.data || cats || []);
      setProducts(prods?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load put-away rules', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [branchId]);

  const blank = () => ({
    name: '', branchId: Number(branchId),
    matchType: 'StorageClass', matchValue: 'Cold',
    targetBinId: '', priority: 100, isActive: true,
  });

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...editing,
        branchId: Number(branchId),
        targetBinId: Number(editing.targetBinId),
        priority: Number(editing.priority) || 100,
        matchValue: String(editing.matchValue),
      };
      if (editing.id) await warehouseOpsApi.updateRule(editing.id, payload);
      else await warehouseOpsApi.createRule(payload);
      showToast('Rule saved');
      setEditing(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the rule', 'error');
    }
    setBusy(false);
  };

  const toggle = async (rule) => {
    try {
      await warehouseOpsApi.updateRule(rule.id, { isActive: !rule.isActive });
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not change the rule', 'error');
    }
  };

  const remove = async (rule) => {
    try {
      await warehouseOpsApi.removeRule(rule.id);
      showToast('Rule removed');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not remove the rule', 'error');
    }
  };

  /** Reads a rule's match value back into something a person recognises. */
  const describeMatch = (rule) => {
    if (rule.matchType === 'Category') {
      return categories.find((c) => String(c.id) === String(rule.matchValue))?.name || `Category ${rule.matchValue}`;
    }
    if (rule.matchType === 'Product') {
      return products.find((p) => String(p.id) === String(rule.matchValue))?.productName || `Product ${rule.matchValue}`;
    }
    return rule.matchValue;
  };

  /** The right control for whatever the rule is matching on. */
  const valueField = () => {
    if (editing.matchType === 'StorageClass') {
      return (
        <TextField select fullWidth size="small" label="Storage class" value={editing.matchValue}
          onChange={(e) => setEditing({ ...editing, matchValue: e.target.value })}
          InputLabelProps={{ shrink: true }}>
          {storageClasses.map((cls) => (
            <MenuItem key={cls} value={cls}>
              <Box>
                <Typography variant="body2" fontWeight={600}>{cls}</Typography>
                <Typography variant="caption" color="text.secondary">{CLASS_HINTS[cls] || ''}</Typography>
              </Box>
            </MenuItem>
          ))}
        </TextField>
      );
    }
    if (editing.matchType === 'Category') {
      return (
        <TextField select fullWidth size="small" label="Category" value={editing.matchValue}
          onChange={(e) => setEditing({ ...editing, matchValue: e.target.value })}
          InputLabelProps={{ shrink: true }}>
          {categories.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
        </TextField>
      );
    }
    if (editing.matchType === 'Product') {
      return (
        <TextField select fullWidth size="small" label="Product" value={editing.matchValue}
          onChange={(e) => setEditing({ ...editing, matchValue: e.target.value })}
          InputLabelProps={{ shrink: true }}>
          {products.map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.productName}</MenuItem>)}
        </TextField>
      );
    }
    return (
      <TextField fullWidth size="small" label="Brand id" value={editing.matchValue}
        onChange={(e) => setEditing({ ...editing, matchValue: e.target.value })}
        InputLabelProps={{ shrink: true }} />
    );
  };

  if (loading) return <Loader />;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="body2" color="text.secondary">
          Rules are tried in priority order; the first match decides where the stock goes.
        </Typography>
        <Button startIcon={<AddIcon />} variant="contained" disabled={!bins.length}
          onClick={() => setEditing(blank())} sx={{ borderRadius: 2 }}>
          Add Rule
        </Button>
      </Stack>

      {!bins.length && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          This location has no bins, so there is nowhere for a rule to send stock. Set up zones and bins
          under Warehouses first.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Rule</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>When the product is</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Put it in</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Priority</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Active</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <RuleIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                      <Typography variant="body2" fontWeight={600}>{rule.name}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{describeMatch(rule)}</Typography>
                    <Typography variant="caption" color="text.secondary">{rule.matchType}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={rule.targetBin?.code || `#${rule.targetBinId}`} size="small"
                      sx={{ fontFamily: 'monospace', mr: 1 }} />
                    <Typography component="span" variant="caption" color="text.secondary">
                      {rule.targetBin?.name || rule.targetBin?.level}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{rule.priority}</TableCell>
                  <TableCell align="center">
                    <Switch size="small" checked={Boolean(rule.isActive)} onChange={() => toggle(rule)} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Button size="small" onClick={() => setEditing({ ...rule })}>Edit</Button>
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error" onClick={() => remove(rule)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!rules.length && (
                <TableRow><TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                    No rules yet — put-away suggests wherever a product already lives, or a bin with room.
                  </Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit Rule' : 'New Put-Away Rule'}
        onClose={() => setEditing(null)} maxWidth="sm">
        {editing && (
          <Stack spacing={2}>
            <TextField fullWidth size="small" label="Rule name" value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Cold goods to cold storage" InputLabelProps={{ shrink: true }} />

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={5}>
                <TextField select fullWidth size="small" label="Match on" value={editing.matchType}
                  onChange={(e) => setEditing({
                    ...editing,
                    matchType: e.target.value,
                    // The old value means nothing under a different match type.
                    matchValue: e.target.value === 'StorageClass' ? 'Cold' : '',
                  })}
                  InputLabelProps={{ shrink: true }}>
                  {matchTypes.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={7}>{valueField()}</Grid>

              <Grid item xs={12} sm={8}>
                <TextField select fullWidth size="small" label="Send it to" value={editing.targetBinId || ''}
                  onChange={(e) => setEditing({ ...editing, targetBinId: e.target.value })}
                  InputLabelProps={{ shrink: true }}>
                  {bins.map((bin) => (
                    <MenuItem key={bin.id} value={bin.id}>{bin.path || bin.code} — {bin.level}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField fullWidth size="small" type="number" label="Priority" value={editing.priority}
                  onChange={(e) => setEditing({ ...editing, priority: e.target.value })}
                  helperText="Lower runs first" InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ height: '100%' }}>
                  <Switch checked={Boolean(editing.isActive)}
                    onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
                  <Typography variant="body2">Active</Typography>
                </Stack>
              </Grid>
            </Grid>

            {editing.name && editing.targetBinId && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Arriving stock matching <strong>{describeMatch(editing)}</strong> will be suggested for{' '}
                <strong>{bins.find((b) => String(b.id) === String(editing.targetBinId))?.code}</strong>.
                The storeman can still choose otherwise.
              </Alert>
            )}

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" sx={{ borderRadius: 2 }}
                disabled={busy || !editing.name || !editing.targetBinId || !editing.matchValue}
                onClick={save}>
                {busy ? 'Saving…' : 'Save Rule'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
