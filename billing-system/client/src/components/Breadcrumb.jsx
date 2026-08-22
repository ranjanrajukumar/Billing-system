import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { Box, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

/**
 * The thin band at the top of a list page: a Back pill, the trail, and the
 * page's actions pushed to the right.
 *
 * This replaces the tall title block on list screens. A 22px heading with a
 * sentence of description under it costs about ninety vertical pixels to say
 * something the sidebar has already said by highlighting the current item —
 * and on a list page those ninety pixels are two rows of the table, which is
 * the thing the user actually came for.
 *
 * Sized to Zentory's: 16px of horizontal padding, 12px vertical, 14px medium
 * text throughout, and a fully rounded Back button.
 */
export default function Breadcrumb({ backPath, items = [], actions, onBack }) {
  const navigate = useNavigate();

  const goBack = () => {
    if (onBack) return onBack();
    // A configured path beats history: arriving from a deep link should still
    // send the user somewhere sensible rather than out of the application.
    return backPath ? navigate(backPath) : navigate(-1);
  };

  return (
    <Stack direction="row" alignItems="center" gap={0.5} sx={{ px: 1.25, py: 1 }}>
      {(backPath || onBack) && (
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
          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
            Back
          </Typography>
        </Box>
      )}

      {items.map((item, index) => (
        <Stack key={item.label} direction="row" alignItems="center" gap={0.5}>
          {index > 0 && <NavigateNextIcon sx={{ fontSize: 15, color: 'text.secondary' }} />}
          <Typography
            component={item.onClick ? 'button' : 'span'}
            onClick={item.onClick}
            sx={{
              fontSize: '0.875rem',
              fontWeight: 500,
              border: 'none',
              bgcolor: 'transparent',
              font: 'inherit',
              p: 0,
              cursor: item.onClick ? 'pointer' : 'default',
              color: item.active ? 'primary.main' : 'text.primary',
              '&:hover': item.onClick ? { color: 'primary.main' } : undefined,
            }}
          >
            {item.label}
          </Typography>
        </Stack>
      ))}

      {actions && <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>{actions}</Box>}
    </Stack>
  );
}
