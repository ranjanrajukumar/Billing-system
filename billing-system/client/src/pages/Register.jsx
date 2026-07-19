import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { Alert, Box, Button, Link, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const { register: registerUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm({ defaultValues: { name: '', email: '', mobile: '', password: '', confirmPassword: '' } });

  if (isAuthenticated) return <Navigate to="/" replace />;

  const onSubmit = async ({ confirmPassword, ...values }) => {
    setError('');
    try {
      await registerUser(values);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 460, p: 4, border: 1, borderColor: 'divider' }}>
        <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
          <PersonAddIcon color="primary" fontSize="large" />
          <Typography variant="h4">Create account</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            {...register('name', {
              required: 'Name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' }
            })}
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
          />
          <TextField
            label="Email"
            type="email"
            {...register('email', { required: 'Email is required' })}
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
          />
          <TextField
            label="Mobile"
            {...register('mobile')}
            error={Boolean(errors.mobile)}
            helperText={errors.mobile?.message}
          />
          <TextField
            label="Password"
            type="password"
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Password must be at least 8 characters' }
            })}
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
          />
          <TextField
            label="Confirm password"
            type="password"
            {...register('confirmPassword', {
              required: 'Confirm your password',
              validate: (value) => value === watch('password') || 'Passwords do not match'
            })}
            error={Boolean(errors.confirmPassword)}
            helperText={errors.confirmPassword?.message}
          />
          <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
            Register
          </Button>
          <Typography variant="body2" color="text.secondary" align="center">
            Already have an account?{' '}
            <Link component={RouterLink} to="/login" underline="hover">
              Sign in
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
