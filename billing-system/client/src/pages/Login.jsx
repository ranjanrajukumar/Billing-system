import LockIcon from '@mui/icons-material/Lock';
import { Alert, Box, Button, Link, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ defaultValues: { email: 'admin@example.com', password: 'Admin@123' } });

  if (isAuthenticated) return <Navigate to="/" replace />;

  const onSubmit = async (values) => {
    setError('');
    try {
      await login(values);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 420, p: 4, border: 1, borderColor: 'divider' }}>
        <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
          <LockIcon color="primary" fontSize="large" />
          <Typography variant="h4">Sign in</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Email" {...register('email', { required: 'Email is required' })} error={Boolean(errors.email)} helperText={errors.email?.message} />
          <TextField label="Password" type="password" {...register('password', { required: 'Password is required' })} error={Boolean(errors.password)} helperText={errors.password?.message} />
          <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>Login</Button>
          <Typography variant="body2" color="text.secondary" align="center">
            New user?{' '}
            <Link component={RouterLink} to="/register" underline="hover">
              Create an account
            </Link>
          </Typography>
          <Typography variant="caption" color="text.secondary">Default seed login: admin@example.com / Admin@123</Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
