import PersonIcon from '@mui/icons-material/Person';
import SaveIcon from '@mui/icons-material/Save';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import LockIcon from '@mui/icons-material/Lock';
import {
  alpha, Avatar, Box, Button, Divider, Grid,
  Paper, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import api from '../services/api.js';

function SectionCard({ title, icon, children }) {
  const theme = useTheme();
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', maxWidth: 760 }}>
      <Stack direction="row" spacing={1.5} alignItems="center"
        sx={{ px: 2.5, py: 1.75, borderBottom: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.primary.main, 0.03) }}
      >
        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' }}>
          {icon}
        </Box>
        <Typography fontWeight={700} variant="subtitle1">{title}</Typography>
      </Stack>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>{children}</Box>
    </Paper>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const theme = useTheme();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();
  const { showToast } = useToast();

  useEffect(() => {
    if (user) reset({ name: user.name || '', email: user.email || '', mobile: user.mobile || '', password: '' });
  }, [user, reset]);

  const getImageUrl = (path) =>
    path ? (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '') + path : '';

  const initials = user?.name ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  const submit = async (values) => {
    try {
      const fd = new FormData();
      Object.keys(values).forEach((k) => {
        if (k === 'profileImage' && values[k]?.[0]) fd.append('profileImage', values[k][0]);
        else fd.append(k, values[k] ?? '');
      });
      const res = await api.put('/auth/profile', fd);
      updateUser(res.data.user);
      showToast('Profile updated successfully');
    } catch (err) {
      showToast(err.response?.data?.message || 'Error updating profile', 'error');
    }
  };

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="My Profile"
        subtitle="Manage your account details and password"
        icon={<PersonIcon />}
      />

      <Stack spacing={3} sx={{ maxWidth: 760 }}>
        {/* Avatar section */}
        <SectionCard title="Profile Photo" icon={<CameraAltIcon fontSize="small" />}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ xs: 'center', sm: 'flex-start' }}>
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
              <Avatar
                src={getImageUrl(user?.profileImagePath)}
                sx={{
                  width: 96, height: 96,
                  fontSize: '2rem', fontWeight: 700,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  boxShadow: '0 8px 24px rgba(79,70,229,0.35)',
                }}
              >
                {initials}
              </Avatar>
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} mb={0.5}>{user?.name}</Typography>
              <Typography variant="body2" color="text.secondary" mb={1.5}>{user?.email}</Typography>
              <Button variant="outlined" component="label" startIcon={<CameraAltIcon />} sx={{ borderRadius: 2 }}>
                Upload Photo
                <input type="file" hidden accept="image/*" {...register('profileImage')} />
              </Button>
              <Typography variant="caption" color="text.disabled" display="block" mt={1}>
                PNG, JPG up to 2MB. Square images work best.
              </Typography>
            </Box>
          </Stack>
        </SectionCard>

        {/* Account info */}
        <SectionCard title="Account Information" icon={<PersonIcon fontSize="small" />}>
          <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Full Name" {...register('name', { required: true })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="email" label="Email Address" {...register('email', { required: true })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Mobile Number" {...register('mobile')} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }}>
                <Typography variant="caption" color="text.disabled" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Change Password
                </Typography>
              </Divider>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth type="password" label="New Password"
                placeholder="Leave blank to keep current"
                {...register('password')}
                InputLabelProps={{ shrink: true }}
                helperText="Minimum 8 characters"
              />
            </Grid>
            <Grid item xs={12}>
              <Stack direction="row" justifyContent="flex-end">
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSubmitting}
                  startIcon={<SaveIcon />}
                  sx={{ borderRadius: 2, minWidth: 160 }}
                >
                  {isSubmitting ? 'Saving…' : 'Save Changes'}
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </SectionCard>
      </Stack>
    </Stack>
  );
}
