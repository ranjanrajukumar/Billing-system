import LockIcon from '@mui/icons-material/Lock';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import SaveIcon from '@mui/icons-material/Save';
import {
  alpha, Alert, Box, Button, Checkbox, Chip, Divider, FormControlLabel,
  Grid, MenuItem, Paper, Stack, TextField, Typography, useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Loader from './Loader.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';

/**
 * Per-role control over which menu entries a role can see. Rights only narrow
 * what a role can reach; the API still enforces its own rules.
 */
export default function MenuRights() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [catalogue, setCatalogue] = useState([]);
  const [alwaysVisible, setAlwaysVisible] = useState([]);
  const [roles, setRoles] = useState([]);
  const [roleId, setRoleId] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/users/menu-rights').then((r) => r.data);
      setCatalogue(data.catalogue || []);
      setAlwaysVisible(data.alwaysVisible || []);
      setRoles(data.roles || []);
      const first = data.roles?.find((r) => !r.isAdmin) || data.roles?.[0];
      if (first) { setRoleId(String(first.id)); setSelected(first.menus || []); }
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load menu rights', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const role = roles.find((r) => String(r.id) === String(roleId));

  const chooseRole = (id) => {
    setRoleId(id);
    setSelected(roles.find((r) => String(r.id) === String(id))?.menus || []);
  };

  const toggle = (key) => setSelected((prev) => (
    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
  ));

  const toggleGroup = (items, on) => setSelected((prev) => {
    const keys = items.map((i) => i.key);
    return on ? [...new Set([...prev, ...keys])] : prev.filter((k) => !keys.includes(k));
  });

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.put(`/users/menu-rights/${roleId}`, { menus: selected }).then((r) => r.data);
      setRoles((prev) => prev.map((r) => (r.id === saved.id ? { ...r, menus: saved.menus } : r)));
      setSelected(saved.menus);
      showToast(`Menu rights saved for ${saved.name}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to save menu rights', 'error');
    }
    setSaving(false);
  };

  const totalSelected = useMemo(
    () => catalogue.flatMap((g) => g.items).filter((i) => selected.includes(i.key)).length,
    [catalogue, selected],
  );

  if (loading) return <Loader />;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <TextField
          select size="small" label="Role" value={roleId}
          onChange={(e) => chooseRole(e.target.value)}
          sx={{ minWidth: 220 }} InputLabelProps={{ shrink: true }}
        >
          {roles.map((r) => (
            <MenuItem key={r.id} value={String(r.id)}>
              {r.name}{r.isAdmin ? ' (all access)' : ''}
            </MenuItem>
          ))}
        </TextField>

        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" icon={<MenuOpenIcon />} label={`${totalSelected} pages visible`} sx={{ fontWeight: 700 }} />
          <Button
            variant="contained" startIcon={<SaveIcon />} sx={{ borderRadius: 2 }}
            disabled={saving || role?.isAdmin}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save Rights'}
          </Button>
        </Stack>
      </Stack>

      {role?.isAdmin ? (
        <Alert severity="info" icon={<LockIcon />} sx={{ borderRadius: 2 }}>
          The <strong>Admin</strong> role always sees every menu and cannot be restricted. Pick another
          role to configure its pages.
        </Alert>
      ) : (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Unticking a page hides it from the menu and blocks it if the address is typed directly.
          Dashboard and Profile always stay visible so nobody is locked out.
        </Alert>
      )}

      <Grid container spacing={2}>
        {catalogue.map((group) => {
          const keys = group.items.map((i) => i.key);
          const allOn = keys.every((k) => selected.includes(k));
          return (
            <Grid item xs={12} md={6} key={group.group}>
              <Paper variant="outlined" sx={{ borderRadius: 2.5, p: 2, height: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2" fontWeight={800}>{group.group}</Typography>
                  <Button
                    size="small" disabled={role?.isAdmin}
                    onClick={() => toggleGroup(group.items, !allOn)}
                  >
                    {allOn ? 'Clear all' : 'Select all'}
                  </Button>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Stack>
                  {group.items.map((item) => {
                    const locked = alwaysVisible.includes(item.key);
                    return (
                      <FormControlLabel
                        key={item.key}
                        control={
                          <Checkbox
                            size="small"
                            checked={selected.includes(item.key) || locked}
                            disabled={locked || role?.isAdmin}
                            onChange={() => toggle(item.key)}
                          />
                        }
                        label={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2">{item.label}</Typography>
                            {locked && (
                              <Chip
                                size="small" label="Always on"
                                sx={{ height: 18, fontSize: '0.65rem', bgcolor: alpha(theme.palette.info.main, 0.12) }}
                              />
                            )}
                          </Stack>
                        }
                      />
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Box>
        <Typography variant="caption" color="text.secondary">
          Users see updated menus the next time they sign in.
        </Typography>
      </Box>
    </Stack>
  );
}
