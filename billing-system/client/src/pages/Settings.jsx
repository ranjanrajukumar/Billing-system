import SaveIcon from '@mui/icons-material/Save';
import ImageIcon from '@mui/icons-material/Image';
import BusinessIcon from '@mui/icons-material/Business';
import ReceiptIcon from '@mui/icons-material/Receipt';
import {
  alpha, Box, Button, Divider, Grid, MenuItem, Paper,
  Stack, TextField, Typography, useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import Loader from '../components/Loader.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { settingsApi } from '../services/resource.service.js';
import { useFetch } from '../hooks/useFetch.js';
import api from '../services/api.js';

function SectionCard({ title, icon, children }) {
  const theme = useTheme();
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Stack
        direction="row" spacing={1.5} alignItems="center"
        sx={{
          px: 2.5, py: 1.75,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.primary.main, 0.03),
        }}
      >
        <Box sx={{
          width: 32, height: 32, borderRadius: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'primary.main',
        }}>
          {icon}
        </Box>
        <Typography fontWeight={700} variant="subtitle1">{title}</Typography>
      </Stack>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>{children}</Box>
    </Paper>
  );
}

export default function Settings() {
  const { data, loading, reload } = useFetch(() => settingsApi.get(), []);
  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm();
  const [logoPreview, setLogoPreview] = useState('');
  const [templates, setTemplates] = useState([]);
  const { showToast } = useToast();
  const theme = useTheme();

  useEffect(() => { if (data?.company) reset(data.company); }, [data, reset]);
  useEffect(() => {
    api.get('/invoice-templates', { params: { limit: 100 } })
      .then((res) => setTemplates(res.data.data || []))
      .catch(() => setTemplates([]));
  }, []);

  const selectedLogo = watch('logo');
  const savedLogoUrl = useMemo(() => {
    const path = data?.company?.logoPath;
    return path ? (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '') + path : '';
  }, [data?.company?.logoPath]);

  useEffect(() => {
    const file = selectedLogo?.[0];
    if (!file) { setLogoPreview(savedLogoUrl); return; }
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedLogo, savedLogoUrl]);

  const submit = async (values) => {
    const fd = new FormData();
    Object.keys(values).forEach((k) => {
      if (k === 'logo' && values[k]?.[0]) fd.append('logo', values[k][0]);
      else if (k !== 'logo' && k !== 'logoPath') fd.append(k, values[k] ?? '');
    });
    await settingsApi.saveCompany(fd);
    showToast('Settings saved successfully');
    reload();
  };

  if (loading) return <Loader />;

  const companyFields = [
    { name: 'name', label: 'Company Name', sm: 6, required: true },
    { name: 'gstNumber', label: 'GST Number', sm: 6 },
    { name: 'email', label: 'Email', sm: 6 },
    { name: 'mobile', label: 'Mobile', sm: 6 },
    { name: 'address', label: 'Address', sm: 12 },
    { name: 'city', label: 'City', sm: 4 },
    { name: 'state', label: 'State', sm: 4, required: true },
    { name: 'pincode', label: 'Pincode', sm: 4 },
    { name: 'signatureUrl', label: 'Signature URL', sm: 12 },
  ];

  return (
    <Stack spacing={3} component="form" onSubmit={handleSubmit(submit)} className="animate-fadeInUp">
      <PageHeader
        title="Settings"
        subtitle="Configure your company profile and invoice preferences"
        icon={<BusinessIcon />}
        action={
          <Button type="submit" startIcon={<SaveIcon />} variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2, minWidth: 140 }}>
            {isSubmitting ? 'Saving…' : 'Save Settings'}
          </Button>
        }
      />

      {/* Company Logo Section */}
      <SectionCard title="Company Logo" icon={<ImageIcon fontSize="small" />}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ xs: 'flex-start', sm: 'center' }}>
          <Box
            sx={{
              width: 160,
              height: 90,
              borderRadius: 2.5,
              border: `2px dashed ${alpha(theme.palette.primary.main, 0.3)}`,
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'border-color 0.2s',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
            ) : (
              <Stack alignItems="center" spacing={0.5}>
                <ImageIcon sx={{ color: 'text.disabled', fontSize: 28 }} />
                <Typography variant="caption" color="text.disabled">No logo</Typography>
              </Stack>
            )}
          </Box>
          <Box>
            <Button variant="outlined" component="label" sx={{ borderRadius: 2, mb: 1 }}>
              {logoPreview ? 'Change Logo' : 'Upload Logo'}
              <input type="file" hidden accept="image/*" {...register('logo')} />
            </Button>
            <Typography variant="caption" color="text.secondary" display="block">
              Recommended: PNG with transparent background, min 300×100px
            </Typography>
          </Box>
        </Stack>
      </SectionCard>

      {/* Company Info Section */}
      <SectionCard title="Company Information" icon={<BusinessIcon fontSize="small" />}>
        <Grid container spacing={2}>
          {companyFields.map(({ name, label, sm, required }) => (
            <Grid item xs={12} sm={sm} key={name}>
              <TextField
                fullWidth label={label}
                {...register(name, { required: required && 'Required' })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          ))}
        </Grid>
      </SectionCard>

      {/* Invoice Preferences Section */}
      <SectionCard title="Invoice Preferences" icon={<ReceiptIcon fontSize="small" />}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth select label="Default Invoice Format"
              {...register('defaultInvoiceTemplate')}
            >
              <MenuItem value="standard">Standard</MenuItem>
              <MenuItem value="modern">Modern</MenuItem>
              <MenuItem value="compact">Compact</MenuItem>
              <MenuItem value="premium">Premium (Dark Blue)</MenuItem>
              <MenuItem value="thermal">Thermal (80mm)</MenuItem>
              {templates.map((t) => (
                <MenuItem key={t.id} value={`template:${t.id}`}>{t.templateName}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </SectionCard>

      {/* Mobile save button */}
      <Box sx={{ display: { sm: 'none' } }}>
        <Button
          type="submit"
          fullWidth
          startIcon={<SaveIcon />}
          variant="contained"
          disabled={isSubmitting}
          size="large"
          sx={{ borderRadius: 2.5 }}
        >
          {isSubmitting ? 'Saving…' : 'Save All Settings'}
        </Button>
      </Box>
    </Stack>
  );
}
