import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import {
  alpha, Box, Chip, Collapse, Divider, IconButton, Menu, MenuItem,
  Paper, Stack, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useState } from 'react';
import { date as formatDate } from '../utils/formatters.js';

/**
 * The period filter used across every list and report.
 *
 * Kept to a single row: the common choices sit inline as chips, the rest live
 * behind a menu, and the custom date boxes stay hidden until asked for. The
 * alternative — chips, dates and a caption always stacked — turned every page
 * into three rows of chrome before any content appeared.
 *
 * The named periods match the server's list in utils/dateRange.js, and only the
 * name is sent. The dates are the server's job, so a screen left open overnight
 * cannot quietly keep filtering to yesterday's window.
 */

export const PERIOD_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'last3Months', label: 'Last 3 months' },
  { key: 'last6Months', label: 'Last 6 months' },
  { key: 'last12Months', label: 'Last 12 months' },
  { key: 'thisFinancialYear', label: 'This FY' },
  { key: 'lastFinancialYear', label: 'Last FY' },
  { key: 'thisYear', label: 'This year' },
  { key: 'lastYear', label: 'Last year' },
  { key: 'all', label: 'All time' },
];

/** Shown as chips; everything else is one click away in the menu. */
const INLINE = ['thisMonth', 'last3Months', 'thisFinancialYear', 'all'];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** The last two years of months, newest first, as YYYY-MM. */
function recentMonths(count = 24) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` };
  });
}

const labelForMonth = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  return match ? `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}` : 'Pick month';
};

export default function PeriodFilter({
  value = {},
  onChange,
  options = PERIOD_OPTIONS,
  allowCustom = true,
  /** Set when the caller already provides a surrounding card. */
  disableContainer = false,
}) {
  const theme = useTheme();
  const [anchor, setAnchor] = useState(null);
  const [monthAnchor, setMonthAnchor] = useState(null);
  const [showDates, setShowDates] = useState(false);
  const months = recentMonths();

  const isCustom = Boolean(value.from || value.to);
  const isMonth = !isCustom && value.period === 'month' && Boolean(value.month);
  const active = isCustom ? 'custom' : (value.period || 'thisMonth');
  const inline = options.filter((o) => INLINE.includes(o.key));
  const more = options.filter((o) => !INLINE.includes(o.key));
  const activeLabel = options.find((o) => o.key === active)?.label;

  // Choosing a named period clears any custom dates, and vice versa, so the two
  // can never disagree about what is being shown.
  const pick = (key) => {
    onChange({ period: key, from: '', to: '', month: '' });
    setAnchor(null);
    setShowDates(false);
  };
  const pickMonth = (month) => {
    // A named month is sent as-is; the server turns it into the right dates,
    // including the correct last day for February in a leap year.
    onChange({ period: 'month', month, from: '', to: '' });
    setMonthAnchor(null);
    setShowDates(false);
  };
  const setCustom = (patch) => onChange({ ...value, ...patch, period: 'custom', month: '' });
  const clearCustom = () => {
    onChange({ period: 'thisMonth', from: '', to: '', month: '' });
    setShowDates(false);
  };

  const body = (
    <Stack spacing={showDates ? 1.25 : 0}>
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
        <CalendarMonthIcon fontSize="small" sx={{ color: 'text.disabled' }} />

        {inline.map((option) => (
          <Chip
            key={option.key}
            size="small"
            label={option.label}
            color={active === option.key ? 'primary' : 'default'}
            variant={active === option.key ? 'filled' : 'outlined'}
            onClick={() => pick(option.key)}
            sx={{ fontWeight: 600, fontSize: '0.72rem', borderRadius: 1.5 }}
          />
        ))}

        {more.length > 0 && (
          <Chip
            size="small"
            label={more.some((o) => o.key === active) ? activeLabel : 'More'}
            color={more.some((o) => o.key === active) ? 'primary' : 'default'}
            variant={more.some((o) => o.key === active) ? 'filled' : 'outlined'}
            onClick={(e) => setAnchor(e.currentTarget)}
            sx={{ fontWeight: 600, fontSize: '0.72rem', borderRadius: 1.5 }}
          />
        )}

        {/* Pick one specific month, rather than a window relative to today. */}
        <Chip
          size="small"
          icon={<CalendarMonthIcon sx={{ fontSize: 15 }} />}
          label={isMonth ? labelForMonth(value.month) : 'Month'}
          color={isMonth ? 'primary' : 'default'}
          variant={isMonth ? 'filled' : 'outlined'}
          onClick={(e) => setMonthAnchor(e.currentTarget)}
          sx={{ fontWeight: 600, fontSize: '0.72rem', borderRadius: 1.5 }}
        />

        {allowCustom && (
          <>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
            <Tooltip title="Pick exact dates">
              <Chip
                size="small"
                icon={<TuneIcon sx={{ fontSize: 15 }} />}
                label={isCustom
                  ? `${value.from ? formatDate(value.from) : '…'} – ${value.to ? formatDate(value.to) : '…'}`
                  : 'Custom'}
                color={isCustom ? 'primary' : 'default'}
                variant={isCustom ? 'filled' : 'outlined'}
                onClick={() => setShowDates((prev) => !prev)}
                onDelete={isCustom ? clearCustom : undefined}
                deleteIcon={isCustom ? <CloseIcon /> : undefined}
                sx={{ fontWeight: 600, fontSize: '0.72rem', borderRadius: 1.5 }}
              />
            </Tooltip>
          </>
        )}
      </Stack>

      {allowCustom && (
        <Collapse in={showDates} unmountOnExit>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 3.5, pt: 0.25 }}>
            <TextField
              size="small" type="date" label="From" value={value.from || ''}
              onChange={(e) => setCustom({ from: e.target.value })}
              InputLabelProps={{ shrink: true }} sx={{ maxWidth: 170 }}
            />
            <Box sx={{ color: 'text.disabled', fontSize: '0.8rem' }}>to</Box>
            <TextField
              size="small" type="date" label="To" value={value.to || ''}
              onChange={(e) => setCustom({ to: e.target.value })}
              InputLabelProps={{ shrink: true }} sx={{ maxWidth: 170 }}
            />
          </Stack>
        </Collapse>
      )}

      <Menu
        anchorEl={monthAnchor}
        open={Boolean(monthAnchor)}
        onClose={() => setMonthAnchor(null)}
        slotProps={{ paper: { sx: { maxHeight: 320 } } }}
      >
        {months.map((month) => (
          <MenuItem
            key={month.value}
            selected={isMonth && value.month === month.value}
            onClick={() => pickMonth(month.value)}
            sx={{ fontSize: '0.85rem' }}
          >
            {month.label}
          </MenuItem>
        ))}
      </Menu>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {more.map((option) => (
          <MenuItem
            key={option.key}
            selected={active === option.key}
            onClick={() => pick(option.key)}
            sx={{ fontSize: '0.85rem' }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  );

  if (disableContainer) return body;

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 3,
        px: 1.75,
        py: 1.25,
        bgcolor: alpha(theme.palette.primary.main, 0.02),
      }}
    >
      {body}
    </Paper>
  );
}

/** The period in words, for a printed header or a caption. */
export function periodLabel(value = {}) {
  if (value.from || value.to) {
    return `${value.from || 'the beginning'} to ${value.to || 'today'}`;
  }
  if (value.period === 'month' && value.month) return labelForMonth(value.month);
  return PERIOD_OPTIONS.find((o) => o.key === value.period)?.label || 'All records';
}

/** Strips the filter down to the query parameters the API expects. */
export function periodParams(value = {}) {
  if (value.from || value.to) {
    return { from: value.from || undefined, to: value.to || undefined };
  }
  if (value.period === 'month' && value.month) {
    return { period: 'month', month: value.month };
  }
  return value.period && value.period !== 'all' ? { period: value.period } : {};
}
