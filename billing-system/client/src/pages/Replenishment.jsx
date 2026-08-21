import AutorenewIcon from '@mui/icons-material/Autorenew';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import {
  Alert, Box, Button, Checkbox, Chip, Grid, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { replenishmentApi } from '../services/resource.service.js';

/**
 * The buying queue.
 *
 * Every line shows its working — stock, incoming, forecast and safety stock —
 * because a buyer will not approve a number they cannot reconstruct, and the
 * fastest way to have an automated system ignored is to ask for trust it has
 * not earned yet.
 *
 * Sorted by urgency rather than by product, since the queue is worked from the
 * top and rarely to the end.
 */

const URGENCY_COLOUR = { Critical: 'error', High: 'warning', Normal: 'info', Low: 'default' };

const STATUS_OPTIONS = [
  { value: 'Pending', label: 'Pending decision' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Modified', label: 'Modified' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Ordered', label: 'Ordered' },
  { value: 'all', label: 'All' },
];

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const qty = (value) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function Replenishment() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [summary, setSummary] = useState({ byUrgency: {} });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState([]);
  const [filters, setFilters] = useState({ status: 'Pending', urgency: '', sourceType: '', search: '' });
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 50 };
      for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;

      const [list, stats] = await Promise.all([
        replenishmentApi.list(params),
        replenishmentApi.summary(),
      ]);
      setRows(list.data || []);
      setMeta(list.meta || {});
      setSummary(stats || { byUrgency: {} });
      setSelected([]);
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load recommendations', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters]);

  const runEngine = async () => {
    setRunning(true);
    try {
      const result = await replenishmentApi.run();
      showToast(
        result.generated
          ? `${result.generated} recommendation(s) generated, ${result.critical} critical.`
          : 'Nothing needs replenishing right now.',
      );
      await load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not run the engine', 'error');
    } finally {
      setRunning(false);
    }
  };

  const decide = async (action, quantity, note) => {
    setBusy(true);
    try {
      await replenishmentApi.decide(decision.id, { action, quantity, note });
      showToast(action === 'approve' ? 'Approved' : 'Rejected');
      setDecision(null);
      await load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not save the decision', 'error');
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (action) => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const result = await replenishmentApi.bulkDecide({ ids: selected, action });
      showToast(`${result.updated} line(s) ${action === 'approve' ? 'approved' : 'rejected'}.`);
      await load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not apply the decision', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) => setSelected((current) => (
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  ));

  const pendingRows = useMemo(() => rows.filter((row) => row.status === 'Pending'), [rows]);

  const columns = [
    {
      field: 'select',
      headerName: '',
      render: (row) => (
        <Checkbox
          size="small"
          disabled={row.status !== 'Pending'}
          checked={selected.includes(row.id)}
          onChange={() => toggle(row.id)}
        />
      ),
    },
    {
      field: 'product',
      headerName: 'Product',
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={700}>{row.Product?.productName || '-'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {row.Product?.sku || 'No SKU'} · {row.Branch?.branchName || '-'}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'urgency',
      headerName: 'Urgency',
      render: (row) => (
        <Stack spacing={0.5}>
          <Chip
            label={row.urgency}
            size="small"
            color={URGENCY_COLOUR[row.urgency] || 'default'}
            sx={{ fontWeight: 700, fontSize: '0.7rem' }}
          />
          {row.daysOfCover !== null && row.daysOfCover !== undefined && (
            <Typography variant="caption" color="text.secondary">
              {qty(row.daysOfCover)}d cover
            </Typography>
          )}
        </Stack>
      ),
    },
    // The working, laid out so the arithmetic reads left to right.
    { field: 'currentStock', headerName: 'On hand', render: (row) => qty(row.currentStock) },
    { field: 'incomingStock', headerName: 'Incoming', render: (row) => qty(row.incomingStock) },
    {
      field: 'forecastQty',
      headerName: 'Forecast',
      render: (row) => (
        <Tooltip title={`Over ${row.horizonDays} days (lead time ${row.leadTimeDays ?? '-'}d + review period)`}>
          <span>{qty(row.forecastQty)}</span>
        </Tooltip>
      ),
    },
    { field: 'safetyStock', headerName: 'Safety', render: (row) => qty(row.safetyStock) },
    {
      field: 'recommendedQty',
      headerName: 'Recommended',
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={800} color="primary.main">
            {qty(row.recommendedQty)}
          </Typography>
          {row.approvedQty !== null && row.approvedQty !== undefined
            && Number(row.approvedQty) !== Number(row.recommendedQty) && (
            <Typography variant="caption" color="warning.main">
              approved {qty(row.approvedQty)}
            </Typography>
          )}
        </Box>
      ),
    },
    { field: 'estimatedCost', headerName: 'Est. cost', render: (row) => money(row.estimatedCost) },
    {
      field: 'sourceType',
      headerName: 'Source',
      render: (row) => (
        <Chip
          size="small"
          variant="outlined"
          icon={row.sourceType === 'Transfer' ? <LocalShippingIcon /> : <WarehouseIcon />}
          label={row.sourceType === 'Transfer'
            ? `From ${row.sourceBranch?.branchName || 'another location'}`
            : (row.Supplier?.supplierName || 'Purchase')}
          sx={{ fontSize: '0.7rem' }}
        />
      ),
    },
    { field: 'status', headerName: 'Status', render: (row) => <StatusChip status={row.status} /> },
    {
      field: 'actions',
      headerName: '',
      render: (row) => (row.status === 'Pending' ? (
        <Button size="small" variant="outlined" onClick={() => setDecision(row)}>Review</Button>
      ) : null),
    },
  ];

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Replenishment"
        subtitle="What to bring in, where it should come from, and why"
        icon={<AutorenewIcon />}
        action={(
          <Button
            startIcon={<AutorenewIcon />}
            variant="contained"
            onClick={runEngine}
            disabled={running}
          >
            {running ? 'Calculating…' : 'Run engine'}
          </Button>
        )}
      />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Pending decisions"
            value={summary.pending ?? 0}
            detail={`${summary.transfers ?? 0} transfer · ${summary.purchases ?? 0} purchase`}
            gradient="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Critical"
            value={summary.byUrgency?.Critical ?? 0}
            detail="Already out, or will be before stock lands"
            gradient="error"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Units to order"
            value={qty(summary.units)}
            detail="Across all pending lines"
            gradient="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Estimated value"
            value={money(summary.estimatedValue)}
            detail="At current cost price"
            gradient="success"
          />
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
        <TextField
          select size="small" label="Status" sx={{ minWidth: 180 }}
          value={filters.status}
          onChange={(event) => setFilters((f) => ({ ...f, status: event.target.value }))}
        >
          {STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
          ))}
        </TextField>
        <TextField
          select size="small" label="Urgency" sx={{ minWidth: 150 }}
          value={filters.urgency}
          onChange={(event) => setFilters((f) => ({ ...f, urgency: event.target.value }))}
        >
          <MenuItem value="">All</MenuItem>
          {['Critical', 'High', 'Normal', 'Low'].map((value) => (
            <MenuItem key={value} value={value}>{value}</MenuItem>
          ))}
        </TextField>
        <TextField
          select size="small" label="Source" sx={{ minWidth: 150 }}
          value={filters.sourceType}
          onChange={(event) => setFilters((f) => ({ ...f, sourceType: event.target.value }))}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="Purchase">Purchase</MenuItem>
          <MenuItem value="Transfer">Transfer</MenuItem>
        </TextField>
        <TextField
          size="small" label="Search product or SKU" sx={{ minWidth: 220 }}
          value={filters.search}
          onChange={(event) => setFilters((f) => ({ ...f, search: event.target.value }))}
        />

        <Box sx={{ flex: 1 }} />

        {selected.length > 0 && (
          <Stack direction="row" spacing={1}>
            <Typography variant="body2" sx={{ alignSelf: 'center' }} color="text.secondary">
              {selected.length} selected
            </Typography>
            <Button
              size="small" variant="contained" color="success" startIcon={<CheckIcon />}
              disabled={busy} onClick={() => bulk('approve')}
            >
              Approve
            </Button>
            <Button
              size="small" variant="outlined" color="error" startIcon={<CloseIcon />}
              disabled={busy} onClick={() => bulk('reject')}
            >
              Reject
            </Button>
          </Stack>
        )}
      </Stack>

      {loading ? <Loader rows={8} /> : (
        <>
          {pendingRows.length === 0 && filters.status === 'Pending' && (
            <Alert severity="success">
              Nothing needs replenishing. Run the engine after the next forecast to check again.
            </Alert>
          )}
          <DataTable columns={columns} rows={rows} meta={meta} mobileKeyField="id" />
        </>
      )}

      <DecisionModal
        recommendation={decision}
        busy={busy}
        onClose={() => setDecision(null)}
        onDecide={decide}
      />
    </Stack>
  );
}

/**
 * The approve / modify / reject dialog.
 *
 * Opens with the recommended quantity already filled in and editable: changing
 * it is the "modify" action, so accepting a different number is one step rather
 * than a separate mode.
 */
function DecisionModal({ recommendation, busy, onClose, onDecide }) {
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    setQuantity(recommendation ? String(recommendation.recommendedQty) : '');
    setNote('');
  }, [recommendation]);

  if (!recommendation) return null;

  const changed = Number(quantity) !== Number(recommendation.recommendedQty);

  return (
    <Modal
      open={Boolean(recommendation)}
      onClose={onClose}
      title={`Review — ${recommendation.Product?.productName || 'line'}`}
    >
      <Stack spacing={2}>
        <Alert severity="info" icon={false}>
          <Typography variant="body2">{recommendation.rationale}</Typography>
        </Alert>

        <Grid container spacing={1}>
          {[
            ['On hand', qty(recommendation.currentStock)],
            ['Reserved', qty(recommendation.reservedStock)],
            ['Incoming', qty(recommendation.incomingStock)],
            ['Forecast', `${qty(recommendation.forecastQty)} / ${recommendation.horizonDays}d`],
            ['Safety stock', qty(recommendation.safetyStock)],
            ['Lead time', `${recommendation.leadTimeDays ?? '-'} days`],
          ].map(([label, value]) => (
            <Grid item xs={6} sm={4} key={label}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body2" fontWeight={700}>{value}</Typography>
            </Grid>
          ))}
        </Grid>

        <TextField
          label="Quantity to order"
          type="number"
          size="small"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          helperText={changed
            ? `Recommended was ${qty(recommendation.recommendedQty)} — this will be recorded as modified`
            : 'Change this to approve a different quantity'}
        />

        <TextField
          label="Note (optional)"
          size="small"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            color="error" variant="outlined" disabled={busy}
            onClick={() => onDecide('reject', null, note)}
          >
            Reject
          </Button>
          <Button
            variant="contained" disabled={busy}
            onClick={() => onDecide('approve', quantity, note)}
          >
            {changed ? 'Approve modified' : 'Approve'}
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
}
