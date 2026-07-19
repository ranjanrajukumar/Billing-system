import SaveIcon from '@mui/icons-material/Save';
import { Button, Grid, Paper, Stack, TextField, Typography, MenuItem } from '@mui/material';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Loader from '../components/Loader.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { settingsApi } from '../services/resource.service.js';
import { useFetch } from '../hooks/useFetch.js';

export default function Settings() {
  const { data, loading, reload } = useFetch(() => settingsApi.get(), []);
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();
  const { showToast } = useToast();
  useEffect(() => { if (data?.company) reset(data.company); }, [data, reset]);
  const submit = async (values) => {
    await settingsApi.saveCompany(values);
    showToast('Settings saved');
    reload();
  };
  if (loading) return <Loader />;
  return (
    <Stack spacing={2}>
      <Typography variant="h4">Settings</Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)}>
          {['name', 'gstNumber', 'email', 'mobile', 'address', 'city', 'state', 'pincode', 'signatureUrl'].map((name) => (
            <Grid item xs={12} sm={name === 'address' ? 12 : 6} key={name}><TextField fullWidth label={name.replace(/([A-Z])/g, ' $1')} {...register(name, { required: ['name', 'state'].includes(name) })} /></Grid>
          ))}
          <Grid item xs={12} sm={6}>
            <TextField fullWidth select label="Default Invoice Format" {...register('defaultInvoiceTemplate')}>
              <MenuItem value="standard">Standard</MenuItem>
              <MenuItem value="modern">Modern</MenuItem>
              <MenuItem value="compact">Compact</MenuItem>
              <MenuItem value="premium">Premium (Dark Blue)</MenuItem>
              <MenuItem value="thermal">Thermal (80mm)</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12}><Button type="submit" startIcon={<SaveIcon />} variant="contained" disabled={isSubmitting}>Save</Button></Grid>
        </Grid>
      </Paper>
    </Stack>
  );
}
