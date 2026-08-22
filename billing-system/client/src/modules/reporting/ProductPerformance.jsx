import InventoryIcon from '@mui/icons-material/Inventory2';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  alpha, Box, Chip, Grid, LinearProgress, MenuItem, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { dashboardApi } from '../../services/resource.service.js';
import { currency } from '../../utils/formatters.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** The last 24 months, newest first, as { value: 'YYYY-MM', label: 'August 2026' }. */
function recentMonths(count = 24) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`,
      label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    };
  });
}

function recentYears(count = 6) {
  const thisYear = new Date().getFullYear();
  return Array.from({ length: count }, (_, i) => String(thisYear - i));
}

/** One ranked product row. */
function ProductRow({ rank, product, tone, maxQuantity }) {
  const theme = useTheme();
  const colour = theme.palette[tone].main;
  // A bar makes the gap between first and last obvious at a glance.
  const width = maxQuantity > 0 ? Math.max((product.quantity / maxQuantity) * 100, 2) : 0;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: alpha(colour, 0.04) }}
    >
      <Box
        sx={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          bgcolor: alpha(colour, 0.14), color: colour,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.72rem', fontWeight: 800,
        }}
      >
        {rank}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Tooltip title={product.productName}>
          <Typography variant="body2" fontWeight={600} noWrap>{product.productName}</Typography>
        </Tooltip>
        <Box sx={{ height: 4, borderRadius: 2, bgcolor: alpha(colour, 0.12), mt: 0.5 }}>
          <Box sx={{ height: '100%', width: `${width}%`, borderRadius: 2, bgcolor: colour }} />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {product.invoiceCount} {product.invoiceCount === 1 ? 'invoice' : 'invoices'} · {product.stock} in stock
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography variant="body2" fontWeight={800} sx={{ color: colour }}>
          {product.quantity}
        </Typography>
        <Typography variant="caption" color="text.secondary">{currency(product.revenue)}</Typography>
      </Box>
    </Stack>
  );
}

import { BarChart } from '@mui/x-charts';

function RankedPanel({ title, caption, icon, tone, products, emptyText, useChart = false }) {
  const theme = useTheme();
  const colour = theme.palette[tone].main;
  const maxQuantity = products.reduce((max, p) => Math.max(max, p.quantity), 0);

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5, height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <Box
          sx={{
            width: 32, height: 32, borderRadius: 1.5,
            bgcolor: alpha(colour, 0.12), color: colour,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="subtitle2">{title}</Typography>
          <Typography variant="caption" color="text.secondary">{caption}</Typography>
        </Box>
      </Stack>
      {products.length > 0 ? (
        useChart ? (
          <Box sx={{ height: 300, width: '100%' }}>
            <BarChart
              layout="horizontal"
              dataset={products.slice(0, 5)}
              yAxis={[{ scaleType: 'band', dataKey: 'productName' }]}
              series={[{ dataKey: 'quantity', label: 'Units Sold', color: colour }]}
              margin={{ left: 120 }}
            />
          </Box>
        ) : (
          <Stack spacing={1}>
            {products.map((product, i) => (
              <ProductRow key={product.id} rank={i + 1} product={product} tone={tone} maxQuantity={maxQuantity} />
            ))}
          </Stack>
        )
      ) : (
        <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
          <InventoryIcon sx={{ fontSize: 36, opacity: 0.3 }} />
          <Typography variant="body2" sx={{ mt: 1 }}>{emptyText}</Typography>
        </Box>
      )}
    </Paper>
  );
}

/**
 * Best and worst selling products for a chosen month or year. Products that
 * sold nothing still appear in the low-selling list — those are usually the
 * ones worth knowing about.
 */
export default function ProductPerformance() {
  const months = useMemo(() => recentMonths(), []);
  const years = useMemo(() => recentYears(), []);
  const [period, setPeriod] = useState('month');
  const [value, setValue] = useState(months[0].value);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Switching between month, quarter and year needs a matching value, not the
  // last one used, which would belong to the wrong vocabulary.
  const changePeriod = (next) => {
    if (!next || next === period) return;
    setPeriod(next);
    setValue(next === 'year' ? years[0] : months[0].value);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardApi.productPerformance({ period, value })
      .then((result) => { if (!cancelled) { setData(result); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || 'Unable to load product performance'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, value]);

  const totals = data?.totals;

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700}>Product Performance</Typography>
          {/* The panels below stay put while a new period loads, so the caption
              carries the fact that it is changing rather than a blank screen. */}
          <Typography variant="caption" color="text.secondary">
            {loading && !data
              ? 'Loading…'
              : `What sold, and what did not, in ${data?.label || ''}`}
          </Typography>
          {loading && <LinearProgress sx={{ height: 2, borderRadius: 1, mt: 0.5 }} />}
        </Box>
        <Stack direction="row" spacing={1}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={period}
            onChange={(_e, next) => changePeriod(next)}
          >
            <ToggleButton value="month" sx={{ px: 2 }}>Month</ToggleButton>
            <ToggleButton value="quarter" sx={{ px: 2 }}>3 Months</ToggleButton>
            <ToggleButton value="year" sx={{ px: 2 }}>Year</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            select size="small" value={value} onChange={(e) => setValue(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            {period === 'year'
              ? years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)
              : months.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {period === 'quarter' ? `3 months to ${m.label}` : m.label}
                </MenuItem>
              ))}
          </TextField>
        </Stack>
      </Stack>

      {error ? (
        <Paper variant="outlined" sx={{ borderRadius: 3, p: 3, textAlign: 'center' }}>
          <Typography color="error" variant="body2">{error}</Typography>
        </Paper>
      ) : (
        <>
          {totals && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" variant="outlined" label={`${totals.unitsSold} units sold`} />
              <Chip size="small" variant="outlined" color="primary" label={`${currency(totals.revenue)} billed`} />
              <Chip size="small" variant="outlined" color="success" label={`${totals.productsSold} products sold`} />
              <Chip
                size="small"
                variant="outlined"
                color={totals.productsUnsold > 0 ? 'warning' : 'default'}
                label={`${totals.productsUnsold} never sold`}
              />
            </Stack>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <RankedPanel
                title="High Selling"
                caption="Most units sold in this period"
                icon={<TrendingUpIcon fontSize="small" />}
                tone="success"
                products={data?.top || []}
                emptyText="Nothing sold in this period"
                useChart={true}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <RankedPanel
                title="Low Selling"
                caption="Least units sold, including none at all"
                icon={<TrendingDownIcon fontSize="small" />}
                tone="warning"
                products={data?.bottom || []}
                emptyText="No products in the catalogue yet"
              />
            </Grid>
          </Grid>
        </>
      )}
    </Stack>
  );
}
