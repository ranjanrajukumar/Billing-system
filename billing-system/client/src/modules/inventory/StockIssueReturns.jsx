import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import {
  Alert, Box, Grid, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { stockIssuesApi } from '../../services/resource.service.js';

/**
 * Material Return Notes.
 *
 * The register of what has come back. Raising one happens on the issue screen,
 * against the voucher the material went out on — a return with no issue behind
 * it is a receipt, and the SRV is already that. This screen is where drafts get
 * posted and where somebody looks up what was handed back last week.
 */
export default function StockIssueReturns() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [status, setStatus] = useState('');
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const list = await stockIssuesApi.returns.list({ limit: 100, ...(status ? { status } : {}) });
      setRows(list?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load material returns', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [status]);

  const act = async (row, action) => {
    // Posting twice is refused by the server anyway, but a double-click should
    // not send the second request in the first place.
    if (busy) return;
    setBusy(true);
    try {
      await stockIssuesApi.returns[action](row.id);
      showToast(action === 'post'
        ? `${row.returnNumber} posted — good material is back in stock`
        : 'Draft return cancelled');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'That could not be done', 'error');
    }
    setBusy(false);
  };

  /** What a return actually put back, as against what it wrote off. */
  const split = (document) => (document.StockIssueReturnItems || []).reduce((totals, line) => {
    const quantity = Number(line.quantity || 0);
    if (line.condition === 'Damaged') totals.scrapped += quantity;
    else totals.good += quantity;
    return totals;
  }, { good: 0, scrapped: 0 });

  const stats = useMemo(() => {
    const posted = rows.filter((r) => r.status === 'Posted');
    return {
      drafts: rows.filter((r) => r.status === 'Draft').length,
      posted: posted.length,
      good: posted.reduce((sum, r) => sum + split(r).good, 0),
      scrapped: posted.reduce((sum, r) => sum + split(r).scrapped, 0),
    };
  }, [rows]);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Material Returns (MRN)"
        subtitle="Issued material coming back to the store"
        icon={<AssignmentReturnIcon />}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatsCard title="Drafts" value={stats.drafts} detail="Not yet back in stock" icon={<AssignmentReturnIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Posted" value={stats.posted} detail="Stock updated" icon={<AssignmentReturnIcon />} gradient="success" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Back on the Shelf" value={stats.good} detail="Returned fit to use" icon={<AssignmentReturnIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Written Off" value={stats.scrapped} detail="Came back damaged" icon={<AssignmentReturnIcon />} gradient="error" />
        </Grid>
      </Grid>

      <Alert severity="info">
        A return is always raised against the issue the material went out on — use
        <strong> Return Items </strong> on the Store Issue screen. This is the register of what has come back.
      </Alert>

      <TextField
        select size="small" label="Status" value={status}
        onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 180, alignSelf: 'flex-start' }}
      >
        <MenuItem value="">All Statuses</MenuItem>
        {['Draft', 'Posted', 'Cancelled'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
      </TextField>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="returnNumber"
          rows={rows}
          columns={[
            { field: 'returnNumber', headerName: 'Return #', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.returnNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{r.returnDate}</Typography>
              </Box>
            )},
            { field: 'issue', headerName: 'Against Issue', render: (r) => r.StockIssue?.issueNumber || '—' },
            { field: 'returnedBy', headerName: 'Returned By', render: (r) => r.returnedBy?.name || r.returnedByName || '—' },
            { field: 'quantities', headerName: 'Good / Damaged', render: (r) => {
              const { good, scrapped } = split(r);
              return (
                <Typography variant="body2">
                  <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>{good}</Box>
                  {' / '}
                  <Box component="span" sx={{ color: scrapped > 0 ? 'error.main' : 'text.disabled', fontWeight: 700 }}>{scrapped}</Box>
                </Typography>
              );
            }},
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
          ]}
          actions={[
            { label: 'View', onClick: (r) => stockIssuesApi.returns.get(r.id).then(setViewing) },
            { label: 'Post to Stock', color: 'success', show: (r) => r.status === 'Draft', onClick: (r) => act(r, 'post') },
            { label: 'Cancel', color: 'error', show: (r) => r.status === 'Draft', onClick: (r) => act(r, 'remove') },
          ]}
        />
      )}

      <Modal
        open={!!viewing} onClose={() => setViewing(null)} maxWidth="md"
        title={`Material Return: ${viewing?.returnNumber || ''}`}
      >
        {viewing && (
          <Stack spacing={3}>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Status</Typography><br />
                <StatusChip status={viewing.status} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Date</Typography>
                <Typography>{viewing.returnDate}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Against Issue</Typography>
                <Typography>{viewing.StockIssue?.issueNumber || '—'}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Returned By</Typography>
                <Typography>{viewing.returnedBy?.name || viewing.returnedByName || '—'}</Typography>
              </Grid>
              {viewing.status === 'Posted' && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Received By</Typography>
                  <Typography>
                    {viewing.receiver?.name || '—'}
                    {viewing.postedAt ? ` at ${new Date(viewing.postedAt).toLocaleString()}` : ''}
                  </Typography>
                </Grid>
              )}
              {viewing.remarks && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Remarks</Typography>
                  <Typography>{viewing.remarks}</Typography>
                </Grid>
              )}
            </Grid>

            <DataTable
              rows={viewing.StockIssueReturnItems || []}
              columns={[
                { field: 'product', headerName: 'Product', render: (r) => r.Product?.productName },
                { field: 'quantity', headerName: 'Quantity', render: (r) => r.quantity },
                { field: 'condition', headerName: 'Condition', render: (r) => <StatusChip status={r.condition} /> },
                { field: 'effect', headerName: 'Effect', render: (r) => (
                  <Typography variant="body2" color={r.condition === 'Damaged' ? 'error.main' : 'success.main'}>
                    {r.condition === 'Damaged' ? 'Written off — not back in stock' : 'Back on the shelf'}
                  </Typography>
                )},
              ]}
            />
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
