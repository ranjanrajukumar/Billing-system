import StorefrontIcon from '@mui/icons-material/Storefront';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  Alert, alpha, Box, Button, IconButton,
  InputAdornment, Link, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const { register: registerUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { name: '', email: '', mobile: '', password: '', confirmPassword: '' },
  });

  if (isAuthenticated) return <Navigate to="/" replace />;

  const onSubmit = async ({ confirmPassword, ...values }) => {
    setError('');
    try { await registerUser(values); navigate('/'); }
    catch (err) { setError(err.response?.data?.message || 'Registration failed'); }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'background.default' }}>
      <Box className="animate-fadeInUp" sx={{ width: '100%', maxWidth: 460 }}>
        {/* Brand */}
        <Stack direction="row" alignItems="center" spacing={1.5} mb={4} justifyContent="center">
          <Box sx={{ width: 44, height: 44, borderRadius: 2, background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 6px 20px rgba(79,70,229,0.4)' }}>
            <StorefrontIcon />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.3rem' }}>ShopBill Pro</Typography>
        </Stack>

        <Typography variant="h4" fontWeight={800} mb={0.5}>Create account</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>Join ShopBill Pro to manage your shop billing</Typography>

        {error && <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>{error}</Alert>}

        <Stack spacing={2.5} component="form" onSubmit={handleSubmit(onSubmit)}>
          <TextField fullWidth label="Full Name" size="medium"
            {...register('name', { required: 'Required', minLength: { value: 2, message: 'At least 2 characters' } })}
            error={Boolean(errors.name)} helperText={errors.name?.message}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField fullWidth label="Email Address" type="email" size="medium"
            {...register('email', { required: 'Required' })}
            error={Boolean(errors.email)} helperText={errors.email?.message}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField fullWidth label="Mobile Number" size="medium"
            {...register('mobile')}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField fullWidth label="Password" type={showPw ? 'text' : 'password'} size="medium"
            {...register('password', { required: 'Required', minLength: { value: 8, message: 'At least 8 characters' } })}
            error={Boolean(errors.password)} helperText={errors.password?.message}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            slotProps={{ input: { endAdornment: (
              <InputAdornment position="end">
                <IconButton type="button" size="small" onClick={() => setShowPw((p) => !p)} edge="end">
                  {showPw ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </InputAdornment>
            )}}}
          />
          <TextField fullWidth label="Confirm Password" type="password" size="medium"
            {...register('confirmPassword', {
              required: 'Required',
              validate: (v) => v === watch('password') || 'Passwords do not match',
            })}
            error={Boolean(errors.confirmPassword)} helperText={errors.confirmPassword?.message}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <Button type="submit" variant="contained" size="large" disabled={isSubmitting} fullWidth
            sx={{ borderRadius: 2, py: 1.4, fontWeight: 700, background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', boxShadow: '0 6px 24px rgba(79,70,229,0.4)' }}
          >
            {isSubmitting ? 'Creating account…' : 'Create Account'}
          </Button>
        </Stack>

        <Stack direction="row" justifyContent="center" mt={3}>
          <Typography variant="body2" color="text.secondary">
            Already have an account?{' '}
            <Link component={RouterLink} to="/login" underline="hover" sx={{ fontWeight: 700 }}>Sign in</Link>
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
