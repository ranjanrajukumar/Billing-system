import FactCheckIcon from '@mui/icons-material/FactCheck';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import {
  Alert, Box, Chip, Grid, MenuItem, Paper, Stack, Tab, Table, TableBody,
  TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Loader from '../components/Loader.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { currency, date as fmtDate } from '../utils/formatters.js';
import { branchesApi, stockAuditApi } from '../services/resource.service.js';

/**
 * Stock audit.
 *
 * Three sources should agree about how much of a product is at a location: the
 * held figure, the movement ledger, and the lot quantities. This screen shows
 * where they do not — and deliberately offers no "fix it" button, because a
 * one-click correction would erase the evidence of whatever caused the drift.
 */
export default function StockAudit() {
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(null);
  const [locations, setLocations] = useState([]);
  const [locationAudit, setLocationAudit] = useState(null);
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  });
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [overview, locs] = await Promise.all([
        stockAuditApi.overview({ from: range.from, to: range.to }),
        branchesApi.list({ limit: 200 }),
      ]);
      setData(overview);
      setLocations(locs?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to run the audit', 'error');
      setData(null);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [range.from, range.to]);

  const openLocation = async (id) => {
    setBranchId(id);
    if (!id) { setLocationAudit(null); return; }
    try {
      setLocationAudit(await stockAuditApi.location(id, { from: range.from, to: range.to }));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not audit that location', 'error');
    }
  };

  const reconciliation = data?.reconciliation;
  const exceptions = data?.exceptions;

  const ExceptionTable = ({ rows }) => (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Movement</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Out</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Balance after</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>By</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.reason}-${row.id}`} hover>
              <TableCell>{fmtDate(row.date)}</TableCell>
              <TableCell>
                <Typography variant="body2">{row.productName}</Typography>
                {row.reference && <Typography variant="caption" color="text.secondary">{row.reference}</Typography>}
              </TableCell>
              <TableCell>{row.branchName}</TableCell>
              <TableCell><Chip label={row.movementType} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} /></TableCell>
              <TableCell align="right"><strong>{row.quantityOut || '—'}</strong></TableCell>
              <TableCell align="right">
                <Typography variant="body2" color={row.balanceAfter < 0 ? 'error.main' : 'text.primary'}>
                  {row.balanceAfter ?? '—'}
                </Typography>
              </TableCell>
              <TableCell>{row.by}</TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow><TableCell colSpan={7}>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                Nothing to flag in this period.
              </Typography>
            </TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Stock Audit"
        subtitle="Do the held figures, the movement ledger and the lots agree?"
        icon={<FactCheckIcon />}
      />

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={6} sm={3}>
            <TextField fullWidth size="small" type="date" label="From" value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField fullWidth size="small" type="date" label="To" value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth select size="small" label="Audit one location" value={branchId}
              onChange={(e) => openLocation(e.target.value)} InputLabelProps={{ shrink: true }}>
              <MenuItem value=""><em>All locations</em></MenuItem>
              {locations.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.branchName}{l.locationType === 'Warehouse' ? ' (Warehouse)' : ''}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {loading ? <Loader /> : data && (
        <>
          <Alert
            severity={reconciliation?.clean ? 'success' : 'error'}
            icon={reconciliation?.clean ? <CheckCircleIcon /> : <WarningIcon />}
            sx={{ borderRadius: 2 }}
          >
            {reconciliation?.clean
              ? `All ${reconciliation.checked} product/location balances agree with the movement ledger.`
              : `${reconciliation?.mismatched} of ${reconciliation?.checked} balances disagree with the ledger — ${currency(reconciliation?.driftValue)} at cost. Something wrote stock without going through the stock engine.`}
          </Alert>

          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Balances checked" value={reconciliation?.checked ?? 0} detail="Product / location pairs"
                icon={<FactCheckIcon />} gradient="primary" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Disagreements" value={reconciliation?.mismatched ?? 0} detail="Held vs ledger"
                icon={<WarningIcon />} gradient={reconciliation?.mismatched ? 'danger' : 'success'} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Drift value" value={currency(reconciliation?.driftValue)} detail="At cost"
                icon={<WarningIcon />} gradient="warning" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatsCard title="Flagged movements" value={exceptions?.total ?? 0} detail="Worth a second look"
                icon={<FactCheckIcon />} gradient="info" />
            </Grid>
          </Grid>

          {locationAudit && (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover' }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {locationAudit.location.name} — statement for the period
                </Typography>
              </Box>
              <Box sx={{ p: 2 }}>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={6} sm={3}><StatsCard title="Opening" value={locationAudit.opening} detail="Start of period" icon={<FactCheckIcon />} gradient="info" /></Grid>
                  <Grid item xs={6} sm={3}><StatsCard title="Received" value={locationAudit.totalIn} detail="In" icon={<FactCheckIcon />} gradient="success" /></Grid>
                  <Grid item xs={6} sm={3}><StatsCard title="Issued" value={locationAudit.totalOut} detail="Out" icon={<FactCheckIcon />} gradient="warning" /></Grid>
                  <Grid item xs={6} sm={3}><StatsCard title="Closing" value={locationAudit.closing} detail="Held now" icon={<FactCheckIcon />} gradient="primary" /></Grid>
                </Grid>

                {!locationAudit.balanced && (
                  <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
                    Opening plus receipts less issues does not equal the closing figure.
                  </Alert>
                )}

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="caption" fontWeight={700} color="text.disabled">BY MOVEMENT TYPE</Typography>
                    <Table size="small">
                      <TableBody>
                        {locationAudit.byType.map((row) => (
                          <TableRow key={row.movementType}>
                            <TableCell>{row.movementType}</TableCell>
                            <TableCell align="right">{row.count}×</TableCell>
                            <TableCell align="right" sx={{ color: 'success.main' }}>{row.totalIn || '—'}</TableCell>
                            <TableCell align="right" sx={{ color: 'error.main' }}>{row.totalOut || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="caption" fontWeight={700} color="text.disabled">WHO MOVED STOCK</Typography>
                    <Table size="small">
                      <TableBody>
                        {locationAudit.byUser.map((row) => (
                          <TableRow key={row.userId ?? 'system'}>
                            <TableCell>{row.userName}</TableCell>
                            <TableCell align="right">{row.movements} movements</TableCell>
                            <TableCell align="right" sx={{ color: 'success.main' }}>{row.totalIn || '—'}</TableCell>
                            <TableCell align="right" sx={{ color: 'error.main' }}>{row.totalOut || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Grid>
                </Grid>
              </Box>
            </Paper>
          )}

          <Paper variant="outlined" sx={{ borderRadius: 2 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
              <Tab label={`Disagreements${reconciliation?.mismatched ? ` (${reconciliation.mismatched})` : ''}`} />
              <Tab label={`Written off (${exceptions?.writeOffs?.length ?? 0})`} />
              <Tab label={`Large issues (${exceptions?.largeMovements?.length ?? 0})`} />
              <Tab label={`Went negative (${exceptions?.negativeBalances?.length ?? 0})`} />
            </Tabs>

            {tab === 0 && (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Held</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Per ledger</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Per lots</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Drift</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>At cost</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(reconciliation?.rows || []).map((row) => (
                      <TableRow key={`${row.productId}-${row.branchId}`} hover>
                        <TableCell>
                          <Typography variant="body2">{row.productName}</Typography>
                          {row.sku && <Typography variant="caption" color="text.secondary">{row.sku}</Typography>}
                        </TableCell>
                        <TableCell>{row.branchName}</TableCell>
                        <TableCell align="right"><strong>{row.onHand}</strong></TableCell>
                        <TableCell align="right">{row.perLedger}</TableCell>
                        <TableCell align="right">{row.perLots ?? '—'}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color="error.main">
                            {row.ledgerDrift > 0 ? `+${row.ledgerDrift}` : row.ledgerDrift}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{currency(row.driftValue)}</TableCell>
                      </TableRow>
                    ))}
                    {!(reconciliation?.rows || []).length && (
                      <TableRow><TableCell colSpan={7}>
                        <Typography variant="body2" color="success.main" align="center" sx={{ py: 3 }}>
                          Every balance agrees with its ledger.
                        </Typography>
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            )}

            {tab === 1 && <ExceptionTable rows={exceptions?.writeOffs || []} />}
            {tab === 2 && <ExceptionTable rows={exceptions?.largeMovements || []} />}
            {tab === 3 && <ExceptionTable rows={exceptions?.negativeBalances || []} />}
          </Paper>
        </>
      )}
    </Stack>
  );
}
