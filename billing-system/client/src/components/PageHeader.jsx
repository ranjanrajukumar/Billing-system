import { Box, Breadcrumbs, Link, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

/**
 * PageHeader — reusable page header
 * Props: title, subtitle, breadcrumbs ([{label, to}]), action (ReactNode), icon
 */
export default function PageHeader({ title, subtitle, breadcrumbs, action, icon }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box className="animate-fadeInUp" sx={{ mb: 3 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs
          separator={<NavigateNextIcon sx={{ fontSize: 14 }} />}
          sx={{ mb: 1 }}
        >
          {breadcrumbs.map((crumb, i) =>
            crumb.to && i < breadcrumbs.length - 1 ? (
              <Link
                key={crumb.label}
                component={RouterLink}
                to={crumb.to}
                underline="hover"
                sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 500 }}
              >
                {crumb.label}
              </Link>
            ) : (
              <Typography
                key={crumb.label}
                sx={{ fontSize: '0.8rem', color: 'primary.main', fontWeight: 600 }}
              >
                {crumb.label}
              </Typography>
            )
          )}
        </Breadcrumbs>
      )}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {icon && (
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2,
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.main',
                border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
              }}
            >
              {icon}
            </Box>
          )}
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                fontSize: { xs: '1.25rem', sm: '1.5rem' },
              }}
            >
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.25 }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>
        {action && (
          <Box sx={{ width: { xs: '100%', sm: 'auto' } }}>
            {action}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
