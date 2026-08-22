import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import RemoveIcon from '@mui/icons-material/Remove';
import {
  alpha, Box, Paper, Stack, Typography, useTheme,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

/**
 * The three bands the operations summary is drawn in.
 *
 * Two conventions run through all of them, and both are about not lying with
 * a number:
 *
 * An em-dash, not a zero, when there is nothing to say. "0 pending approvals"
 * and "this installation has no approvals" look identical as a zero, and the
 * difference is the whole question of whether to go and look.
 *
 * Colour only where it means something. A wall of tinted cards is a wall of
 * noise — amber appears when work has been waiting over a day, red when stock
 * is expiring, and nowhere else. Everything healthy is quiet.
 */

/** A small uppercase band heading. */
export function SectionLabel({ children, sx }) {
  return (
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        fontWeight: 700,
        fontSize: '0.68rem',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'text.disabled',
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}

/** Nothing to report reads as an em-dash, never as a zero. */
const Blank = () => <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>;

/** A card that behaves as a link when it has somewhere to go. */
function Tile({ to, children, sx }) {
  const base = (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%', ...sx }}>
      {children}
    </Paper>
  );
  if (!to) return base;
  return (
    <Box component={RouterLink} to={to} sx={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      {base}
    </Box>
  );
}

/**
 * One of today's figures, with yesterday underneath it.
 *
 * The comparison is deliberately understated — small, grey unless it moved,
 * and silent when yesterday was zero. A percentage against nothing is not a
 * trend, and dressing it as one is how a dashboard teaches people to distrust
 * it.
 */
export function TodayTile({ metric, format }) {
  const theme = useTheme();
  const { deltaPct } = metric;

  const tone = deltaPct === null || deltaPct === 0
    ? theme.palette.text.disabled
    : deltaPct > 0 ? theme.palette.success.main : theme.palette.error.main;

  const Icon = deltaPct === null || deltaPct === 0
    ? RemoveIcon
    : deltaPct > 0 ? ArrowUpwardIcon : ArrowDownwardIcon;

  return (
    <Tile to={metric.path} sx={{ minWidth: 168, flex: '1 1 168px' }}>
      <Stack spacing={0.75}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          {metric.label}
        </Typography>
        <Typography sx={{ fontWeight: 800, fontSize: '1.75rem', lineHeight: 1.1, color: 'text.primary' }}>
          {metric.value ? format(metric) : <Blank />}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: tone }}>
          <Icon sx={{ fontSize: 13 }} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {deltaPct === null ? 'no comparison' : `${Math.abs(deltaPct)}% vs yesterday`}
          </Typography>
        </Stack>
      </Stack>
    </Tile>
  );
}

/**
 * A pending figure split by age.
 *
 * The over-24h half is the only part that is ever tinted, because it is the
 * only part that is a problem. A queue that is entirely under a day is work in
 * progress and should look like it.
 */
export function AgeingTile({ metric }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const overdue = metric.overdue > 0;

  const half = (value, caption, warn) => (
    <Box
      sx={{
        flex: 1,
        px: 1.5,
        py: 1,
        borderRadius: 1.5,
        textAlign: 'center',
        bgcolor: warn
          ? alpha(theme.palette.warning.main, isDark ? 0.16 : 0.1)
          : alpha(theme.palette.text.primary, isDark ? 0.06 : 0.035),
      }}
    >
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: '1.4rem',
          lineHeight: 1.15,
          color: warn ? 'warning.main' : 'text.primary',
        }}
      >
        {value || <Blank />}
      </Typography>
      <Typography variant="caption" color="text.secondary">{caption}</Typography>
    </Box>
  );

  return (
    <Tile
      to={metric.path}
      sx={{
        minWidth: 236,
        flex: '1 1 236px',
        borderColor: overdue ? alpha(theme.palette.warning.main, 0.4) : 'divider',
      }}
    >
      <Stack spacing={1.25}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          {metric.label}
        </Typography>
        <Stack direction="row" spacing={1}>
          {half(metric.recent, 'Under 24h', false)}
          {half(metric.overdue, 'Over 24h', overdue)}
        </Stack>
      </Stack>
    </Tile>
  );
}

/** One area's standing, as a list of label-and-figure rows. */
export function AreaPanel({ area }) {
  const theme = useTheme();

  const toneOf = (row) => (row.tone ? theme.palette[row.tone].main : 'text.primary');

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, height: '100%', overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography sx={{ fontWeight: 700 }}>{area.title}</Typography>
      </Box>
      <Stack>
        {area.rows.map((row, index) => {
          const content = (
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{
                px: 2,
                py: 1.4,
                borderTop: index === 0 ? 'none' : `1px solid ${theme.palette.divider}`,
                '&:hover': row.path ? { bgcolor: alpha(theme.palette.primary.main, 0.04) } : {},
              }}
            >
              <Typography variant="body2" color="text.secondary">{row.label}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: toneOf(row) }}>
                {row.value ? row.value.toLocaleString() : <Blank />}
              </Typography>
            </Stack>
          );

          if (!row.path) return <Box key={row.label}>{content}</Box>;
          return (
            <Box
              key={row.label}
              component={RouterLink}
              to={row.path}
              sx={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              {content}
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}

/** A horizontal band of tiles that scrolls inside itself rather than the page. */
export function Band({ children }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', overflowX: 'auto', pb: 0.5 }}>
      {children}
    </Box>
  );
}
