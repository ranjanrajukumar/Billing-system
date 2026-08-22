import { alpha, Box, Typography, useTheme } from '@mui/material';

/**
 * A summary tile — the strip of figures that sits above a table.
 *
 * Laid out to the Zentory proportions: a 38px tinted icon square on the left,
 * the figure and its label stacked beside it, 16px of horizontal padding and
 * 12px of vertical. That comes out around 62px tall against the 120px this card
 * used to be, which is the whole point — six of these used to push the table
 * itself below the fold, and the table is what people came to read. The figures
 * are context; they should cost a glance, not half the screen.
 *
 * The icon carries the colour now, rather than a gradient wash across the tile
 * and a coloured bar along the top. On a row of six, six gradients compete with
 * each other and with the data underneath; a small tinted square says the same
 * thing quietly.
 */

/** Maps the existing `gradient` prop onto a palette colour. */
const TONES = {
  primary: 'primary',
  secondary: 'warning',
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'info',
  dark: 'primary',
  hero: 'primary',
};

export default function StatsCard({
  title,
  value,
  detail,
  icon,
  gradient = 'primary',
  trend,
  onClick,
  active = false,
}) {
  const theme = useTheme();
  const tone = theme.palette[TONES[gradient] || 'primary'];
  const text = String(value ?? '');

  // Long figures step down rather than overflow — "₹1,24,53,900" must still fit
  // a tile sized for "532".
  const valueSize = text.length > 9 ? '1rem' : text.length > 7 ? '1.125rem' : '1.25rem';

  return (
    <Box
      className="animate-fadeInUp"
      onClick={onClick}
      // `detail` predates this layout and is usually a whole sentence
      // ("Units across branches"). Rendering it as a third line would undo the
      // height saving that is the point of the change, so the forty-odd pages
      // that pass one keep it as the tile's tooltip rather than losing it.
      title={detail || undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') onClick(); } : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        minWidth: 150,
        flex: 1,
        borderRadius: 1.25,
        bgcolor: active ? alpha(tone.main, 0.08) : 'background.paper',
        border: '1px solid',
        borderColor: active ? tone.main : 'divider',
        boxShadow: active ? `0 0 0 2px ${alpha(tone.main, 0.19)}` : 'none',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 120ms, border-color 120ms',
        '&:hover': onClick ? { boxShadow: theme.shadows[1] } : undefined,
      }}
    >
      {icon && (
        <Box
          sx={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(tone.main, 0.12),
            color: tone.main,
            '& .MuiSvgIcon-root': { fontSize: 20 },
          }}
        >
          {icon}
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Typography
          title={text}
          sx={{ fontSize: valueSize, fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {value}
        </Typography>

        <Typography
          title={title}
          sx={{
            fontSize: '0.72rem', fontWeight: 500, color: 'text.secondary',
            lineHeight: 1.2, mt: 0.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {title}
          {trend !== undefined && (
            <Box
              component="span"
              sx={{ ml: 0.75, fontWeight: 700, color: trend >= 0 ? 'success.main' : 'error.main' }}
            >
              {trend >= 0 ? '↑' : '↓'}{Math.abs(trend)}%
            </Box>
          )}
        </Typography>

      </Box>
    </Box>
  );
}
