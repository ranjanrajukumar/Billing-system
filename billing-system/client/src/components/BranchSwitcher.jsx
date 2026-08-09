import StoreIcon from '@mui/icons-material/Store';
import { alpha, MenuItem, TextField, Tooltip, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { ACTIVE_BRANCH_KEY } from '../services/api.js';

/**
 * Lets an Admin choose which branch they are working in. Only rendered when
 * multi-branch mode is on and there is more than one branch to pick from.
 */
export default function BranchSwitcher() {
  const theme = useTheme();
  const { user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [value, setValue] = useState(localStorage.getItem(ACTIVE_BRANCH_KEY) || 'all');

  useEffect(() => {
    if (user?.role !== 'Admin') return;
    Promise.all([
      api.get('/settings').then((r) => r.data),
      api.get('/branches', { params: { limit: 100 } }).then((r) => r.data),
    ])
      .then(([settings, list]) => {
        setEnabled(Boolean(settings?.company?.multiBranchEnabled));
        setBranches(list?.data || []);
      })
      .catch(() => setEnabled(false));
  }, [user?.role]);

  const choose = (next) => {
    setValue(next);
    if (next === 'all') localStorage.removeItem(ACTIVE_BRANCH_KEY);
    else localStorage.setItem(ACTIVE_BRANCH_KEY, next);
    // Everything on screen was loaded for the previous branch.
    window.location.reload();
  };

  if (user?.role !== 'Admin' || !enabled || branches.length < 2) return null;

  return (
    <Tooltip title="Branch you are working in">
      <TextField
        select size="small" value={value}
        onChange={(e) => choose(e.target.value)}
        SelectProps={{ IconComponent: StoreIcon }}
        sx={{
          minWidth: 150,
          '& .MuiOutlinedInput-root': {
            height: 34, borderRadius: 2, fontSize: '0.82rem', fontWeight: 700,
            bgcolor: alpha(theme.palette.primary.main, 0.06),
          },
          '& .MuiSelect-icon': { fontSize: 16, right: 8 },
        }}
      >
        <MenuItem value="all" sx={{ fontSize: '0.82rem' }}>All branches</MenuItem>
        {branches.map((b) => (
          <MenuItem key={b.id} value={String(b.id)} sx={{ fontSize: '0.82rem' }}>
            {b.branchName}
          </MenuItem>
        ))}
      </TextField>
    </Tooltip>
  );
}
