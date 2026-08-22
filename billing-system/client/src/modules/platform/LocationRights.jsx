import StoreIcon from '@mui/icons-material/Store';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import {
  Alert, Box, Button, Checkbox, Chip, IconButton, MenuItem, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { usersApi } from '../../services/resource.service.js';

/**
 * Which branches and warehouses a user may work at, and what they may do there.
 *
 * Shows every location rather than only the granted ones — adding access
 * otherwise means knowing a location exists before you can find it. The star
 * marks where the user lands at sign-in; exactly one is always set, so nobody
 * signs in to nowhere.
 */
export default function LocationRights({ user, open, onClose }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const result = await usersApi.locations(user.id);
      setData(result);
      setRows(result.locations || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not load location rights', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { if (open) load(); }, [open, user?.id]);

  const update = (id, patch) => setRows((list) => list.map((row) => (
    row.id === id ? { ...row, ...patch } : row
  )));

  const toggle = (row) => {
    if (row.granted) {
      update(row.id, { granted: false, accessLevel: null, isPrimary: false });
      return;
    }
    update(row.id, { granted: true, accessLevel: row.accessLevel || 'Operate' });
  };

  /** Exactly one primary, always among the granted locations. */
  const makePrimary = (row) => setRows((list) => list.map((r) => ({
    ...r,
    isPrimary: r.id === row.id,
    granted: r.id === row.id ? true : r.granted,
    accessLevel: r.id === row.id ? (r.accessLevel || 'Operate') : r.accessLevel,
  })));

  const save = async () => {
    setBusy(true);
    try {
      const granted = rows.filter((row) => row.granted);
      const result = await usersApi.saveLocations(user.id, {
        locations: granted.map((row) => ({
          branchId: row.id,
          accessLevel: row.accessLevel || 'Operate',
          isPrimary: Boolean(row.isPrimary),
        })),
      });
      showToast(result.message);
      onClose?.(true);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save location rights', 'error');
    }
    setBusy(false);
  };

  const grantedCount = rows.filter((r) => r.granted).length;

  return (
    <Modal open={open} title={`Locations — ${user?.name || ''}`} onClose={() => onClose?.(false)} maxWidth="md">
      {loading ? <Loader /> : data?.isAdmin ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          <strong>{user?.name} is an Admin.</strong> Admins work at every location by definition — there is
          nothing to grant here. Restricting an Admin would risk leaving nobody able to grant access back.
        </Alert>
      ) : (
        <Stack spacing={2}>
          {data?.usingFallback && grantedCount === 0 && (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              No locations granted yet, so this user works only at their home branch — exactly as before
              per-location rights existed. Grant one or more below to widen that.
            </Alert>
          )}

          {grantedCount > 0 && !rows.some((r) => r.granted && r.isPrimary) && (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              No location is marked as the one they sign in to. The first granted location will be used.
            </Alert>
          )}

          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 240 }}>They may</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Signs in here</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover selected={row.granted}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={Boolean(row.granted)} onChange={() => toggle(row)} />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {row.locationType === 'Warehouse'
                          ? <WarehouseIcon sx={{ fontSize: 17, color: 'text.disabled' }} />
                          : <StoreIcon sx={{ fontSize: 17, color: 'text.disabled' }} />}
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{row.branchName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.branchCode} · {row.locationType}
                            {row.id === data?.homeBranchId ? ' · home branch' : ''}
                          </Typography>
                        </Box>
                        {!row.isActive && <Chip label="Inactive" size="small" sx={{ fontSize: '0.6rem' }} />}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <TextField
                        select fullWidth size="small"
                        value={row.accessLevel || 'Operate'}
                        disabled={!row.granted}
                        onChange={(e) => update(row.id, { accessLevel: e.target.value })}
                      >
                        {(data?.levels || []).map((level) => (
                          <MenuItem key={level.level} value={level.level}>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>{level.level}</Typography>
                              <Typography variant="caption" color="text.secondary">{level.meaning}</Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={row.granted ? 'Land here at sign-in' : 'Grant access first'}>
                        <span>
                          <IconButton size="small" disabled={!row.granted} onClick={() => makePrimary(row)}>
                            {row.isPrimary
                              ? <StarIcon fontSize="small" color="primary" />
                              : <StarBorderIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Removing every location returns this user to their home branch only. The API enforces these
            rights on every request — a location they cannot reach is refused, not merely hidden.
          </Typography>

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => onClose?.(false)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
            <Button variant="contained" disabled={busy} onClick={save} sx={{ borderRadius: 2 }}>
              {busy ? 'Saving…' : 'Save Locations'}
            </Button>
          </Stack>
        </Stack>
      )}
    </Modal>
  );
}
