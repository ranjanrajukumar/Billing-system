import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { Box, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

/**
 * The band at the top of every page: Back, the trail, and the page's actions.
 *
 * Rebuilt to Zentory's proportions. The previous header was a 42px gradient
 * icon tile beside a 24px bold title with a sentence of description under it —
 * around ninety vertical pixels, plus 24px of margin, to say something the
 * sidebar has already said by highlighting the current item. On a list screen
 * those pixels are two rows of the table, which is what the user came for.
 *
 * The props are unchanged on purpose: `title`, `subtitle`, `breadcrumbs`,
 * `action` and `icon` all still work, so the forty-nine pages using this get
 * the shorter header without being edited. `subtitle` and `icon` no longer
 * occupy space — the subtitle becomes the title's tooltip rather than being
 * discarded, and the icon is dropped, since the trail already names the page.
 */
export default function PageHeader({ title, subtitle, breadcrumbs, action, backPath, onBack }) {
  const navigate = useNavigate();

  // Every list screen is reached from somewhere; history is the honest default,
  // and an explicit path wins so a deep link still lands somewhere sensible.
  const goBack = () => {
    if (onBack) return onBack();
    return backPath ? navigate(backPath) : navigate(-1);
  };

  const trail = [...(breadcrumbs || [])];
  // The title is the last crumb. A page that passes both was otherwise
  // printing its own name twice.
  if (title && !trail.some((crumb) => crumb.label === title)) {
    trail.push({ label: title, active: true });
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={0.5}
      className="animate-fadeInUp"
      sx={{ px: 0, py: 1, mb: 1.5, flexWrap: 'wrap' }}
    >
      <Box
        component="button"
        type="button"
        onClick={goBack}
        aria-label="Go back"
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          px: 1.5, py: 0.5, mr: 0.5,
          border: 'none', borderRadius: 999, cursor: 'pointer',
          bgcolor: 'action.hover', color: 'text.primary', font: 'inherit',
          '&:hover': { bgcolor: 'action.selected' },
        }}
      >
        <ArrowBackIcon sx={{ fontSize: 18 }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Back</Typography>
      </Box>

      {trail.map((crumb, index) => {
        const isLast = index === trail.length - 1;
        const label = (
          <Typography
            component="span"
            title={isLast && subtitle ? subtitle : undefined}
            sx={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: isLast ? 'primary.main' : 'text.primary',
              whiteSpace: 'nowrap',
            }}
          >
            {crumb.label}
          </Typography>
        );

        return (
          <Stack key={crumb.label} direction="row" alignItems="center" gap={0.5}>
            {index > 0 && <NavigateNextIcon sx={{ fontSize: 15, color: 'text.secondary' }} />}
            {crumb.to && !isLast ? (
              <Box
                component={RouterLink}
                to={crumb.to}
                sx={{ textDecoration: 'none', '&:hover span': { color: 'primary.main' } }}
              >
                {label}
              </Box>
            ) : label}
          </Stack>
        );
      })}

      {action && (
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {action}
        </Box>
      )}
    </Stack>
  );
}
