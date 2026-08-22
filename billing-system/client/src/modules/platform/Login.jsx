import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StorefrontIcon from '@mui/icons-material/Storefront';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  Alert,
  alpha,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { email: 'admin@example.com', password: 'Admin@123' },
  });

  if (isAuthenticated) return <Navigate to="/" replace />;

  const onSubmit = async (values) => {
    setError('');
    try {
      await login(values);
      navigate('/');
    } catch (err) {
      setError(
        err.response?.data?.message ||
        'Unable to sign in right now. Please make sure the server is running and try again.'
      );
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        bgcolor: 'background.default',
      }}
    >
      {/* Left hero panel — hidden on mobile */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          width: '50%',
          flexShrink: 0,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 70%, #0891b2 100%)',
          backgroundSize: '200% 200%',
          animation: 'gradientShift 8s ease infinite',
        }}
      >
        {/* Decorative circles */}
        {[
          { size: 320, top: -80, right: -80, opacity: 0.12 },
          { size: 220, bottom: 40, left: -60, opacity: 0.1 },
          { size: 140, top: '40%', right: '15%', opacity: 0.08 },
        ].map((c, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              width: c.size,
              height: c.size,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.25)',
              top: c.top,
              bottom: c.bottom,
              left: c.left,
              right: c.right,
              opacity: c.opacity,
            }}
          />
        ))}

        {/* Content */}
        <Box sx={{ position: 'relative', zIndex: 1, px: 6, textAlign: 'center', color: '#fff' }}>
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: 3,
              bgcolor: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <StorefrontIcon sx={{ fontSize: 38, color: '#fff' }} />
          </Box>
          <Typography variant="h3" sx={{ fontWeight: 800, mb: 1.5, letterSpacing: '-0.02em' }}>
            ShopBill Pro
          </Typography>
          <Typography sx={{ opacity: 0.8, fontSize: '1.05rem', lineHeight: 1.7, maxWidth: 340 }}>
            All-in-one inventory &amp; billing platform for modern retail shops
          </Typography>

          {/* Feature pills */}
          <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" sx={{ mt: 4, gap: 1 }}>
            {['📦 Inventory', '🧾 GST Invoices', '📊 Reports', '👥 Customers'].map((f) => (
              <Box
                key={f}
                sx={{
                  px: 2,
                  py: 0.75,
                  borderRadius: 99,
                  bgcolor: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#fff',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {f}
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      {/* Right login panel */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2, sm: 4 },
        }}
      >
        <Box
          className="animate-fadeInUp"
          sx={{ width: '100%', maxWidth: 420 }}
        >
          {/* Mobile brand */}
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ display: { md: 'none' }, mb: 4 }}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 6px 20px rgba(79,70,229,0.4)',
              }}
            >
              <StorefrontIcon />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: 1.1 }}>
                ShopBill Pro
              </Typography>
              <Typography variant="caption" color="text.secondary">Inventory &amp; Billing</Typography>
            </Box>
          </Stack>

          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            Welcome back 👋
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5 }}>
            Sign in to your account to continue
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Stack spacing={2.5} component="form" onSubmit={handleSubmit(onSubmit)}>
            <TextField
              label="Email address"
              type="email"
              fullWidth
              size="medium"
              required {...register('email', { required: 'Email is required' })}
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              label="Password"
              type={showPw ? 'text' : 'password'}
              fullWidth
              size="medium"
              required {...register('password', { required: 'Password is required' })}
              error={Boolean(errors.password)}
              helperText={errors.password?.message}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPw((p) => !p)}
                        edge="end"
                      >
                        {showPw ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isSubmitting}
              fullWidth
              sx={{
                borderRadius: 2,
                py: 1.4,
                fontSize: '0.95rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                boxShadow: '0 6px 24px rgba(79,70,229,0.4)',
                '&:hover': {
                  boxShadow: '0 8px 28px rgba(79,70,229,0.5)',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </Stack>

          <Stack direction="row" justifyContent="center" sx={{ mt: 3 }}>
            <Typography variant="body2" color="text.secondary">
              New here?{' '}
              <Link component={RouterLink} to="/register" underline="hover" sx={{ fontWeight: 700 }}>
                Create account
              </Link>
            </Typography>
          </Stack>

          <Box
            sx={{
              mt: 3,
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.info.main, 0.08),
              border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
              textAlign: 'center',
            }}
          >
            <Typography variant="caption" color="text.secondary">
              🔑 Default: <strong>admin@example.com</strong> / <strong>Admin@123</strong>
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
