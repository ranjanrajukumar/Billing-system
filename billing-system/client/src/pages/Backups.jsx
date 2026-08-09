import BackupIcon from '@mui/icons-material/Backup';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import RestoreIcon from '@mui/icons-material/Restore';
import ScheduleIcon from '@mui/icons-material/Schedule';
import StorageIcon from '@mui/icons-material/Storage';
import {
  Alert, AlertTitle, Box, Button, Chip, Grid, IconButton, MenuItem, Paper,
  Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';

const readableSize = (bytes) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const readableTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN') : '—');

export default function Backups() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const [typed, setTyped] = useState('');
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get('/backups').then((r) => r.data));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load backups', 'error');
      setData(null);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const backupNow = async () => {
    setBusy(true);
    try {
      const result = await api.post('/backups', { label: 'manual' }).then((r) => r.data);
      showToast(`Backed up ${result.rows} rows to ${result.filename}`);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Backup failed', 'error');
    }
    setBusy(false);
  };

  const download = async (filename) => {
    try {
      const blob = await api.get(`/backups/${filename}/download`, { responseType: 'blob' }).then((r) => r.data);
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      showToast(err.response?.data?.message || 'Download failed', 'error');
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/backups/${deleting.filename}`);
      showToast('Backup deleted');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to delete backup', 'error');
    }
    setDeleting(null);
    load();
  };

  const doRestore = async () => {
    setBusy(true);
    try {
      const result = await api
        .post(`/backups/${restoring.filename}/restore`, { confirm: restoring.filename })
        .then((r) => r.data);
      showToast(result.message, 'success');
      setRestoring(null);
      setTyped('');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Restore failed', 'error');
    }
    setBusy(false);
  };

  const saveSchedule = async (patch) => {
    try {
      const next = await api.put('/backups/schedule', patch).then((r) => r.data);
      setData((prev) => ({ ...prev, schedule: next }));
      showToast(next.enabled ? `Nightly backup set for ${next.hour}:00` : 'Nightly backup switched off');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to change the schedule', 'error');
    }
  };

  const schedule = data?.schedule;
  const backups = data?.backups || [];
  const newest = backups[0];

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Backup & Restore"
        subtitle="Full copies of the database you can download and restore from"
        icon={<StorageIcon />}
        action={
          <Button
            startIcon={<BackupIcon />} variant="contained"
            onClick={backupNow} disabled={busy}
          >
            {busy ? 'Working…' : 'Back Up Now'}
          </Button>
        }
      />

      {!loading && !newest && (
        <Alert severity="warning">
          <AlertTitle sx={{ fontWeight: 700 }}>No backups yet</AlertTitle>
          There is currently nothing to restore from. Take one now, and switch on the nightly
          schedule so it keeps happening without anyone remembering to do it.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={6} md={4}>
          <StatsCard
            title="Backups Held" value={backups.length}
            detail={`${readableSize(data?.totalSize)} on disk`}
            icon={<StorageIcon />} gradient="primary"
          />
        </Grid>
        <Grid item xs={6} md={4}>
          <StatsCard
            title="Most Recent" value={newest ? readableSize(newest.size) : '—'}
            detail={newest ? readableTime(newest.createdAt) : 'Never'}
            icon={<BackupIcon />} gradient={newest ? 'success' : 'warning'}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatsCard
            title="Nightly Backup" value={schedule?.enabled ? `${schedule.hour}:00` : 'Off'}
            detail={schedule?.enabled ? `Next ${readableTime(schedule.nextRun)}` : 'Not scheduled'}
            icon={<ScheduleIcon />} gradient={schedule?.enabled ? 'info' : 'warning'}
          />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }} spacing={2}
          alignItems={{ md: 'center' }} justifyContent="space-between"
        >
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>Nightly backup</Typography>
            <Typography variant="caption" color="text.secondary">
              Runs automatically and keeps the most recent copies, deleting older ones.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Switch
              checked={Boolean(schedule?.enabled)}
              onChange={(e) => saveSchedule(
                e.target.checked ? { hour: schedule?.hour ?? 2, keep: schedule?.keep ?? 14 } : { enabled: false },
              )}
            />
            <TextField
              select size="small" label="At" sx={{ minWidth: 110 }}
              value={schedule?.hour ?? 2}
              disabled={!schedule?.enabled}
              onChange={(e) => saveSchedule({ hour: Number(e.target.value), keep: schedule?.keep ?? 14 })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <MenuItem key={h} value={h}>{String(h).padStart(2, '0')}:00</MenuItem>
              ))}
            </TextField>
            <TextField
              select size="small" label="Keep" sx={{ minWidth: 110 }}
              value={schedule?.keep ?? 14}
              disabled={!schedule?.enabled}
              onChange={(e) => saveSchedule({ hour: schedule?.hour ?? 2, keep: Number(e.target.value) })}
            >
              {[7, 14, 30, 60].map((k) => <MenuItem key={k} value={k}>{k} copies</MenuItem>)}
            </TextField>
          </Stack>
        </Stack>
        {schedule?.lastError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            The last scheduled backup failed: {schedule.lastError}
          </Alert>
        )}
      </Paper>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="filename"
          rows={backups}
          columns={[
            { field: 'filename', headerName: 'Archive', render: (r) => (
              <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{r.filename}</Typography>
            )},
            { field: 'createdAt', headerName: 'Taken', render: (r) => readableTime(r.createdAt) },
            { field: 'size', headerName: 'Size', render: (r) => readableSize(r.size) },
            { field: 'label', headerName: 'Kind', render: (r) => (
              <Chip
                size="small" variant="outlined"
                label={r.filename.includes('pre-restore') ? 'Safety copy'
                  : r.filename.includes('scheduled') ? 'Scheduled' : 'Manual'}
                color={r.filename.includes('pre-restore') ? 'warning' : 'default'}
                sx={{ fontWeight: 700, fontSize: '0.7rem' }}
              />
            )},
            { field: 'actions', headerName: 'Actions', render: (r) => (
              <Stack direction="row" spacing={0.25}>
                <Tooltip title="Download">
                  <IconButton size="small" color="primary" onClick={() => download(r.filename)} sx={{ borderRadius: 1.5 }}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Restore from this backup">
                  <IconButton size="small" color="warning" onClick={() => { setRestoring(r); setTyped(''); }} sx={{ borderRadius: 1.5 }}>
                    <RestoreIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton size="small" color="error" onClick={() => setDeleting(r)} sx={{ borderRadius: 1.5 }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )},
          ]}
        />
      )}

      {/* Restore replaces everything, so it asks for the filename to be typed
          out rather than settling for a single click. */}
      <Modal
        open={Boolean(restoring)}
        title="Restore from backup"
        onClose={() => { setRestoring(null); setTyped(''); }}
        maxWidth="sm"
      >
        <Stack spacing={2}>
          <Alert severity="error">
            <AlertTitle sx={{ fontWeight: 700 }}>This replaces the entire database</AlertTitle>
            Every invoice, customer, product and user will be replaced by whatever was in this
            archive on {readableTime(restoring?.createdAt)}. Anything recorded since then will be lost.
          </Alert>
          <Alert severity="info">
            A safety copy of the current database is taken first, so this can itself be undone.
          </Alert>
          <TextField
            fullWidth label="Type the filename to confirm"
            value={typed} onChange={(e) => setTyped(e.target.value)}
            placeholder={restoring?.filename}
            helperText="Copy the archive name exactly"
            InputLabelProps={{ shrink: true }}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button variant="outlined" onClick={() => { setRestoring(null); setTyped(''); }} sx={{ borderRadius: 2 }}>
              Cancel
            </Button>
            <Button
              variant="contained" color="error" startIcon={<RestoreIcon />}
              disabled={busy || typed.trim() !== restoring?.filename}
              onClick={doRestore} sx={{ borderRadius: 2 }}
            >
              {busy ? 'Restoring…' : 'Restore'}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Backup"
        message={`Delete ${deleting?.filename}? This cannot be undone.`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}
