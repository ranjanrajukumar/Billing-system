import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import { tokens } from '../utils/theme.js';

/**
 * StatsCard — premium gradient-icon metric card
 * Props: title, value, detail, icon, gradient (key from tokens.gradients), trend
 */
export default function StatsCard({
  title,
  value,
  detail,
  icon,
  gradient = 'primary',
  trend,
  onClick,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gradientBg = tokens.gradients[gradient] || tokens.gradients.primary;

  return (
    <Box
      className="animate-fadeInUp card-hover"
      onClick={onClick}
      sx={{
        borderRadius: 3,
        p: 2.5,
        background: isDark ? alpha('#ffffff', 0.04) : '#ffffff',
        border: `1px solid ${isDark ? alpha('#ffffff', 0.07) : alpha('#000000', 0.06)}`,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: gradientBg,
          opacity: 0.7,
        },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'text.secondary',
              fontSize: '0.7rem',
              display: 'block',
              mb: 0.75,
            }}
          >
            {title}
          </Typography>
          <Typography
            variant="h4"
            sx={{ fontWeight: 800, lineHeight: 1.1, mb: 0.5, letterSpacing: '-0.02em', fontSize: { xs: '1.5rem', sm: '1.75rem' } }}
          >
            {value}
          </Typography>
          {detail && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              {detail}
            </Typography>
          )}
          {trend !== undefined && (
            <Typography
              variant="caption"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.25,
                mt: 0.5,
                color: trend >= 0 ? 'success.main' : 'error.main',
                fontWeight: 700,
              }}
            >
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </Typography>
          )}
        </Box>
        {icon && (
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2.5,
              background: gradientBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
              ml: 1.5,
              boxShadow: `0 6px 20px ${alpha(
                gradient === 'primary' ? '#4f46e5' :
                gradient === 'success' ? '#10b981' :
                gradient === 'warning' ? '#f59e0b' :
                gradient === 'error' ? '#ef4444' : '#4f46e5',
                0.35
              )}`,
            }}
          >
            {icon}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
