import HomeIcon from '@mui/icons-material/Home';
import { alpha, Box, Button, Stack, Typography, useTheme } from '@mui/material';
import { Link } from 'react-router-dom';

export default function NotFound() {
  const theme = useTheme();
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        bgcolor: 'background.default',
        p: 3,
        textAlign: 'center',
      }}
    >
      {/* Glowing number */}
      <Box sx={{ position: 'relative', mb: 2 }}>
        <Typography
          sx={{
            fontSize: { xs: '6rem', sm: '10rem' },
            fontWeight: 900,
            lineHeight: 1,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #0891b2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.05em',
            filter: 'drop-shadow(0 8px 32px rgba(79,70,229,0.35))',
          }}
        >
          404
        </Typography>
        {/* Decorative blur blob */}
        <Box
          sx={{
            position: 'absolute',
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(79,70,229,0.25) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: -1,
            pointerEvents: 'none',
          }}
        />
      </Box>

      <Typography variant="h5" fontWeight={700} sx={{ mb: 1, letterSpacing: '-0.01em' }}>
        Page Not Found
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ mb: 4, maxWidth: 360, lineHeight: 1.7 }}
      >
        The page you're looking for doesn't exist or has been moved. Let's get you back on track.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button
          component={Link}
          to="/"
          variant="contained"
          startIcon={<HomeIcon />}
          size="large"
          sx={{
            borderRadius: 2.5,
            px: 3,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            boxShadow: '0 6px 24px rgba(79,70,229,0.4)',
            fontWeight: 700,
            '&:hover': { boxShadow: '0 8px 28px rgba(79,70,229,0.5)', transform: 'translateY(-1px)' },
            transition: 'all 0.2s',
          }}
        >
          Go to Dashboard
        </Button>
        <Button
          onClick={() => window.history.back()}
          variant="outlined"
          size="large"
          sx={{
            borderRadius: 2.5,
            px: 3,
            fontWeight: 600,
            borderColor: alpha(theme.palette.primary.main, 0.4),
          }}
        >
          Go Back
        </Button>
      </Stack>
    </Box>
  );
}
