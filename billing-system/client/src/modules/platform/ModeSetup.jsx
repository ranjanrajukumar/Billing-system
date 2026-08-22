import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import StorefrontIcon from '@mui/icons-material/Storefront';
import LockIcon from '@mui/icons-material/Lock';
import {
  Alert, Box, Chip, Divider, Grid, Paper, Stack, Switch, Tooltip, Typography, alpha, useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { settingsApi } from '../../services/resource.service.js';

/**
 * The switch between running a shop and running an ERP.
 *
 * Basic mode is a POS with inventory and party ledgers. Advanced adds the full
 * workflow — purchase orders, warehouses, transfers, accounting, approvals.
 * Switching is reversible and touches no data: going back to Basic only hides
 * the advanced screens, so a business can try Advanced without risking anything
 * it has already recorded.
 */
const MODE_COPY = {
  Basic: {
    icon: <StorefrontIcon />,
    title: 'Basic — a shop',
    blurb: 'POS billing, products, purchases, inventory and customer/supplier ledgers. Nothing else on screen.',
  },
  Advanced: {
    icon: <BusinessCenterIcon />,
    title: 'Advanced — a business',
    blurb: 'Everything in Basic plus purchase orders and GRN, warehouses, stock transfers and counting, expenses, cash and bank, full accounting and approval workflows.',
  },
};

export default function ModeSetup() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(null);
  const { showToast } = useToast();
  const { user, updateUser } = useAuth();
  const theme = useTheme();

  const load = async () => {
    try {
      setState(await settingsApi.modules());
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not read the module setup', 'error');
    }
  };
  useEffect(() => { load(); }, []);

  /** Refreshes the signed-in user so the sidebar reflects the change at once. */
  const refreshMenus = async (modules) => {
    if (!user) return;
    const enabled = modules.filter((m) => m.enabled).map((m) => m.key);
    updateUser({ ...user, modules: enabled });
  };

  const switchMode = async (mode) => {
    if (mode === state.mode) return;
    setBusy('mode');
    try {
      const result = await settingsApi.setMode(mode);
      showToast(result.message);
      setState((s) => ({ ...s, mode: result.mode, modules: result.modules }));
      await refreshMenus(result.modules);
      // The sidebar is built from the menu list the server sends at sign-in, so
      // a reload is the honest way to pick up a whole new navigation.
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not switch mode', 'error');
    }
    setBusy(null);
  };

  const toggle = async (module) => {
    setBusy(module.key);
    try {
      const result = await settingsApi.setModule(module.key, !module.enabled);
      showToast(result.message);
      setState((s) => ({ ...s, modules: result.modules }));
      await refreshMenus(result.modules);
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not change that module', 'error');
    }
    setBusy(null);
  };

  if (!state) return null;

  const optional = state.modules.filter((m) => !m.locked);
  const basicModules = optional.filter((m) => m.mode === 'Basic');
  const advancedModules = optional.filter((m) => m.mode === 'Advanced');

  const ModuleRow = ({ module }) => (
    <Stack
      direction="row" alignItems="center" justifyContent="space-between"
      sx={{ py: 0.75, opacity: module.available ? 1 : 0.45 }}
    >
      <Box>
        <Typography variant="body2" fontWeight={600}>{module.label}</Typography>
        {!module.available && (
          <Typography variant="caption" color="text.secondary">Advanced mode only</Typography>
        )}
      </Box>
      <Switch
        size="small"
        checked={module.enabled}
        disabled={!module.available || busy === module.key}
        onChange={() => toggle(module)}
      />
    </Stack>
  );

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        {['Basic', 'Advanced'].map((mode) => {
          const active = state.mode === mode;
          const copy = MODE_COPY[mode];
          return (
            <Grid item xs={12} sm={6} key={mode}>
              <Paper
                variant="outlined"
                onClick={() => !busy && switchMode(mode)}
                sx={{
                  p: 2, borderRadius: 2.5, height: '100%', cursor: busy ? 'wait' : 'pointer',
                  borderColor: active ? 'primary.main' : 'divider',
                  borderWidth: active ? 2 : 1,
                  bgcolor: active ? alpha(theme.palette.primary.main, 0.05) : 'transparent',
                  transition: 'all 0.15s ease',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Box sx={{
                    width: 40, height: 40, borderRadius: 2, flexShrink: 0,
                    display: 'grid', placeItems: 'center',
                    bgcolor: alpha(theme.palette.primary.main, active ? 0.15 : 0.07),
                    color: 'primary.main',
                  }}>
                    {copy.icon}
                  </Box>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" fontWeight={800}>{copy.title}</Typography>
                      {active && <Chip label="Current" size="small" color="primary" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{copy.blurb}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Alert severity="info" sx={{ borderRadius: 2 }}>
        Switching mode changes only what is on screen and what the API will accept — no data is added,
        moved or deleted, so you can move between the two freely.
      </Alert>

      <Divider />

      <Box>
        <Typography variant="body2" fontWeight={700} gutterBottom>Optional modules</Typography>
        <Typography variant="caption" color="text.secondary">
          Switch off anything this business does not use. A disabled module disappears from the menu and its
          API refuses requests, so it cannot be reached by accident.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Typography variant="caption" fontWeight={700} color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Available in both modes
          </Typography>
          {basicModules.map((m) => <ModuleRow key={m.key} module={m} />)}
        </Grid>
        <Grid item xs={12} md={6}>
          <Typography variant="caption" fontWeight={700} color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Advanced mode
          </Typography>
          {advancedModules.map((m) => <ModuleRow key={m.key} module={m} />)}
        </Grid>
      </Grid>

      <Divider />

      <Stack direction="row" spacing={1} alignItems="center">
        <Tooltip title="These are part of the core application and cannot be switched off">
          <LockIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          Always on: {state.modules.filter((m) => m.locked).map((m) => m.label).join(', ')}
        </Typography>
      </Stack>
    </Stack>
  );
}
