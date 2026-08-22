import EditIcon from '@mui/icons-material/Edit';
import InsightsIcon from '@mui/icons-material/Insights';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import TimelineIcon from '@mui/icons-material/Timeline';
import {
  Alert, Box, Button, Chip, Grid, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { demandPlanningApi } from '../../services/resource.service.js';

/**
 * Demand planning.
 *
 * The forecast is statistical — exponential smoothing with a damped trend and
 * weekly seasonality — and the screen says so rather than implying something
 * cleverer. What earns a planner's trust is not the label on the model but the
 * accuracy figure next to it, which is measured against what actually sold, and
 * the confidence band, which is wide exactly when the data is thin.
 *
 * Overrides sit alongside the model's number rather than replacing it, so the
 * question "are our overrides helping?" stays answerable.
 */

const PERIODS = ['Daily', 'Weekly', 'Monthly'];

const METHOD_HELP = {
  None: 'No usable sales history',
  Naive: 'Under a week of history — average of what there is',
  MovingAverage: 'Recent average; not enough history for a seasonal pattern',
  SeasonalNaive: 'Same period last cycle',
  TrendSeasonal: 'Level + damped trend + weekly seasonality',
  Manual: 'Overridden by a planner',
};

const qty = (value) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function DemandPlanning() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [periodType, setPeriodType] = useState('Daily');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 50, periodType };
      if (search) params.search = search;

      const [list, stats] = await Promise.all([
        demandPlanningApi.list(params),
        demandPlanningApi.summary({ periodType }),
      ]);
      setRows(list.data || []);
      setMeta(list.meta || {});
      setSummary(stats || {});
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not load forecasts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodType, search]);

  const runForecast = async () => {
    setRunning(true);
    try {
      const result = await demandPlanningApi.run({ periodType, horizonDays: 30, historyDays: 365 });
      showToast(result.written
        ? `${result.written} forecast row(s) across ${result.products} product-location series.`
        : (result.message || 'No sales history to forecast from.'));
      await load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not run the forecast', 'error');
    } finally {
      setRunning(false);
    }
  };

  const saveOverride = async (overrideQty, overrideReason) => {
    setBusy(true);
    try {
      await demandPlanningApi.override(editing.id, { overrideQty, overrideReason });
      showToast(overrideQty === null ? 'Override cleared' : 'Override saved');
      setEditing(null);
      await load();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not save the override', 'error');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
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
      field: 'periodStart',
      headerName: 'Period',
      render: (row) => (periodType === 'Daily'
        ? row.periodStart
        : `${row.periodStart} → ${row.periodEnd}`),
    },
    {
      field: 'forecastQty',
      headerName: 'Forecast',
      render: (row) => (
        <Box>
          <Typography
            variant="body2"
            fontWeight={800}
            sx={{ textDecoration: row.overrideQty !== null ? 'line-through' : 'none', opacity: row.overrideQty !== null ? 0.5 : 1 }}
          >
            {qty(row.forecastQty)}
          </Typography>
          {row.overrideQty !== null && row.overrideQty !== undefined && (
            <Typography variant="body2" fontWeight={800} color="warning.main">
              {qty(row.overrideQty)} (override)
            </Typography>
          )}
        </Box>
      ),
    },
    {
      field: 'confidence',
      headerName: 'Confidence band',
      render: (row) => (
        <Tooltip title={`${row.confidencePercent || 80}% interval — wider means the model is less sure`}>
          <Typography variant="caption" color="text.secondary">
            {qty(row.confidenceLow)} – {qty(row.confidenceHigh)}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'actualQty',
      headerName: 'Actual',
      render: (row) => (row.actualQty === null || row.actualQty === undefined
        ? <Typography variant="caption" color="text.secondary">not yet</Typography>
        : (
          <Box>
            <Typography variant="body2">{qty(row.actualQty)}</Typography>
            {row.absPercentError !== null && row.absPercentError !== undefined && (
              <Typography
                variant="caption"
                color={Number(row.absPercentError) <= 20 ? 'success.main' : 'error.main'}
              >
                {qty(row.absPercentError)}% off
              </Typography>
            )}
          </Box>
        )),
    },
    {
      field: 'method',
      headerName: 'Method',
      render: (row) => (
        <Tooltip title={`${METHOD_HELP[row.method] || row.method} · ${row.historyDays} days of history`}>
          <Chip
            size="small"
            variant="outlined"
            label={row.method}
            color={row.method === 'Manual' ? 'warning' : 'default'}
            sx={{ fontSize: '0.7rem' }}
          />
        </Tooltip>
      ),
    },
    {
      field: 'actions',
      headerName: '',
      render: (row) => (
        <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(row)}>
          Override
        </Button>
      ),
    },
  ];

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Demand Planning"
        subtitle="Forecast demand from sales history, and measure how right it was"
        icon={<InsightsIcon />}
        action={(
          <Button
            startIcon={<RestartAltIcon />}
            variant="contained"
            onClick={runForecast}
            disabled={running}
          >
            {running ? 'Forecasting…' : 'Regenerate forecast'}
          </Button>
        )}
      />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Forecast accuracy"
            value={summary.accuracyPercent === null || summary.accuracyPercent === undefined
              ? 'Not yet measured'
              : `${summary.accuracyPercent}%`}
            detail={summary.scoredLines
              ? `Measured on ${summary.scoredLines} closed period(s)`
              : 'Needs closed periods to score against'}
            gradient={summary.accuracyPercent >= 80 ? 'success' : 'warning'}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Forecast units"
            value={qty(summary.forecastUnitsNext30Days)}
            detail="Next 30 days, all lines"
            gradient="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Lines forecast"
            value={summary.linesForecast ?? 0}
            detail={`${summary.overridesActive ?? 0} manually overridden`}
            gradient="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Bias"
            value={`${summary.underForecast ?? 0} / ${summary.overForecast ?? 0}`}
            detail="Under-forecast / over-forecast lines"
            gradient="secondary"
          />
        </Grid>
      </Grid>

      <Alert severity="info" icon={<TimelineIcon />}>
        Forecasts come from your own sales history using exponential smoothing with a damped
        trend and weekly seasonality. Lines with little history fall back to a simpler method and
        say so, and the confidence band widens accordingly — a wide band means order to the
        upper end, not that the number is wrong.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select size="small" label="Period" sx={{ minWidth: 160 }}
          value={periodType}
          onChange={(event) => setPeriodType(event.target.value)}
        >
          {PERIODS.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </TextField>
        <TextField
          size="small" label="Search product or SKU" sx={{ minWidth: 240 }}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Stack>

      {loading ? <Loader rows={8} /> : (
        <>
          {rows.length === 0 && (
            <Alert severity="warning">
              No forecasts yet. Press <strong>Regenerate forecast</strong> — it needs at least a
              couple of weeks of sales history per product to produce a seasonal forecast.
            </Alert>
          )}
          <DataTable columns={columns} rows={rows} meta={meta} mobileKeyField="id" />
        </>
      )}

      <OverrideModal
        forecast={editing}
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={saveOverride}
      />
    </Stack>
  );
}

function OverrideModal({ forecast, busy, onClose, onSave }) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    setQuantity(forecast?.overrideQty ?? '');
    setReason(forecast?.overrideReason ?? '');
  }, [forecast]);

  if (!forecast) return null;

  return (
    <Modal open={Boolean(forecast)} onClose={onClose} title="Override forecast" maxWidth="sm">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {forecast.Product?.productName} · {forecast.Branch?.branchName} · {forecast.periodStart}
        </Typography>

        <Alert severity="info" icon={false}>
          The model predicts <strong>{qty(forecast.forecastQty)}</strong> using{' '}
          {METHOD_HELP[forecast.method] || forecast.method} on {forecast.historyDays} days of
          history. Its number is kept, so the override can be judged on its own record later.
        </Alert>

        <TextField
          label="Your forecast"
          type="number"
          size="small"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          helperText="Leave blank and save to go back to the model's number"
        />
        <TextField
          label="Why"
          size="small"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Festival demand, promotion, local event…"
        />

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          {forecast.overrideQty !== null && forecast.overrideQty !== undefined && (
            <Button color="warning" disabled={busy} onClick={() => onSave(null, null)}>
              Clear override
            </Button>
          )}
          <Button
            variant="contained"
            disabled={busy || quantity === ''}
            onClick={() => onSave(quantity, reason)}
          >
            Save override
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
}
