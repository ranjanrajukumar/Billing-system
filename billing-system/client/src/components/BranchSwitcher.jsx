import StoreIcon from '@mui/icons-material/Store';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import { alpha, Box, MenuItem, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { ACTIVE_BRANCH_KEY } from '../services/api.js';

/**
 * Which location the user is working in.
 *
 * Offers only locations they actually hold rights at — an entry they cannot
 * write to would just produce a 403 one click later. An Admin additionally gets
 * "All locations", which is a reading position rather than a working one.
 *
 * Hidden entirely when there is nothing to choose between, so a single-site
 * shop never sees a control that does nothing.
 */
export default function BranchSwitcher() {
  const theme = useTheme();
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [canViewAll, setCanViewAll] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [value, setValue] = useState(localStorage.getItem(ACTIVE_BRANCH_KEY) || 'all');

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      api.get('/settings').then((r) => r.data),
      api.get('/branches/my-locations').then((r) => r.data),
    ])
      .then(([settings, mine]) => {
        setEnabled(Boolean(settings?.company?.multiBranchEnabled));
        setLocations(mine?.locations || []);
        setCanViewAll(Boolean(mine?.canViewAll));
      })
      .catch(() => setEnabled(false));
  }, [user?.id]);

  const choose = (next) => {
    setValue(next);
    if (next === 'all') localStorage.removeItem(ACTIVE_BRANCH_KEY);
    else localStorage.setItem(ACTIVE_BRANCH_KEY, next);
    // Everything on screen was loaded for the previous location.
    window.location.reload();
  };

  // Nothing to switch between: one location, or multi-location turned off.
  if (!enabled || locations.length < 2) return null;

  return (
    <Tooltip title="Location you are working in">
      <TextField
        select size="small" value={value}
        onChange={(e) => choose(e.target.value)}
        SelectProps={{ IconComponent: StoreIcon }}
        sx={{
          minWidth: 170,
          '& .MuiOutlinedInput-root': {
            height: 34, borderRadius: 2, fontSize: '0.82rem', fontWeight: 700,
            bgcolor: alpha(theme.palette.primary.main, 0.06),
          },
          '& .MuiSelect-icon': { fontSize: 16, right: 8 },
        }}
      >
        {canViewAll && (
          <MenuItem value="all" sx={{ fontSize: '0.82rem' }}>All locations</MenuItem>
        )}
        {locations.map((location) => (
          <MenuItem key={location.id} value={String(location.id)} sx={{ fontSize: '0.82rem' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              {location.locationType === 'Warehouse'
                ? <WarehouseIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
                : <StoreIcon sx={{ fontSize: 15, color: 'text.disabled' }} />}
              <Box>
                <Typography component="span" sx={{ fontSize: '0.82rem', fontWeight: 600 }}>
                  {location.branchName}
                </Typography>
                {/* View-only locations look identical otherwise, and the first
                    sign of the difference would be a refused save. */}
                {location.accessLevel === 'View' && (
                  <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.75 }}>
                    view only
                  </Typography>
                )}
              </Box>
            </Stack>
          </MenuItem>
        ))}
      </TextField>
    </Tooltip>
  );
}
