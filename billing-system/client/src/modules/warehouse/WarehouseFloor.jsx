import WarehouseIcon from '@mui/icons-material/Warehouse';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBasket';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert, Box, Button, Chip, Grid, LinearProgress, MenuItem, Paper, Stack, Tab,
  Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import OrderFulfilment from './OrderFulfilment.jsx';
import PutAwayRules from './PutAwayRules.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import useRequiredFields from '../../hooks/useRequiredFields.js';
import {
  stockCountsApi, stockTransfersApi, warehouseOpsApi, warehousesApi,
} from '../../services/resource.service.js';
import { useNavigate } from 'react-router-dom';

/**
 * The warehouse floor: put-away, picking and packing.
 *
 * These are the three jobs that happen between goods arriving and goods
 * leaving, and each one is a walk around the building — so the screen is
 * organised by the walk, not by the record. Put-away asks "where does this
 * go", picking asks "where do I find it", packing asks "what is in the box".
 *
 * Every one of them is optional. A location with no bins gets told so plainly
 * rather than being shown empty tables.
 */
export default function WarehouseFloor() {
  const [tab, setTab] = useState(0);
  const [locations, setLocations] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [queue, setQueue] = useState(null);
  const [bins, setBins] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(null);
  // Putting stock away needs a shelf to put it on and an amount to put there.
  const putAwayFields = useRequiredFields([
    { name: 'binId', label: 'Destination bin' },
    { name: 'quantity', label: 'Quantity', positive: true },
  ]);
  const [pickList, setPickList] = useState(null);
  const [packing, setPacking] = useState(null);
  const [locate, setLocate] = useState({ query: '', results: null });
  const [occupancy, setOccupancy] = useState(null);
  const [replenish, setReplenish] = useState(null);
  const [moving, setMoving] = useState(null);
  // A move needs both ends and an amount. Which bin it came from is as
  // load-bearing as where it is going: the wrong one silently credits a shelf
  // that never held the goods.
  const moveFields = useRequiredFields([
    { name: 'fromBinId', label: 'From bin' },
    { name: 'toBinId', label: 'To bin' },
    { name: 'quantity', label: 'Quantity', positive: true },
  ]);
  const [counting, setCounting] = useState(null);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const loadLocations = async () => {
    try {
      const list = await warehousesApi.list({ locationType: 'all', limit: 200 });
      const rows = list?.data || [];
      setLocations(rows);
      if (!branchId && rows.length) setBranchId(rows[0].id);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load locations', 'error');
    }
  };
  useEffect(() => { loadLocations(); }, []);

  const load = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [q, binTree, transferList, occ, rep] = await Promise.all([
        warehouseOpsApi.queue({ branchId }),
        warehousesApi.bins(branchId),
        stockTransfersApi.list({ limit: 50 }),
        warehouseOpsApi.occupancy({ branchId }).catch(() => null),
        warehouseOpsApi.replenishment({ branchId }).catch(() => null),
      ]);
      setQueue(q);
      setBins(flatten(binTree));
      setOccupancy(occ);
      setReplenish(rep);
      // Only transfers leaving this location can be picked here.
      setTransfers((transferList?.data || []).filter(
        (t) => Number(t.fromBranchId) === Number(branchId)
          && ['Approved', 'Picked'].includes(t.status),
      ));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load the floor', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [branchId]);

  /** The bin tree read as a flat pick-from list, with the path spelled out. */
  const flatten = (nodes, path = [], out = []) => {
    for (const node of nodes || []) {
      const trail = [...path, node.code];
      out.push({ ...node, path: trail.join(' › ') });
      flatten(node.children || [], trail, out);
    }
    return out;
  };

  // ---- Put-away ----

  const openPutAway = (item) => setPlacing({
    ...item, binId: '', quantity: item.toPutAway, batchId: null,
  });

  const confirmPutAway = async () => {
    if (!putAwayFields.check(placing, showToast)) return;

    setBusy(true);
    try {
      const result = await warehouseOpsApi.putAway({
        branchId: Number(branchId),
        binId: Number(placing.binId),
        productId: placing.productId,
        quantity: Number(placing.quantity),
      });
      showToast(result.warning || 'Put away');
      setPlacing(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not put it away', 'error');
    }
    setBusy(false);
  };

  // ---- Picking ----

  const openPickList = async (transfer) => {
    try {
      setPickList(await warehouseOpsApi.pickList(transfer.id));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not build the pick list', 'error');
    }
  };

  const confirmPick = async () => {
    setBusy(true);
    try {
      const result = await warehouseOpsApi.confirmPick(pickList.transferId, {
        lines: pickList.lines.map((line) => ({ itemId: line.itemId, picks: line.picks })),
      });
      showToast(result.message);
      setPickList(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not confirm the pick', 'error');
    }
    setBusy(false);
  };

  // ---- Packing ----

  const openPacking = async (transfer) => {
    try {
      const [full, existing] = await Promise.all([
        stockTransfersApi.get(transfer.id),
        warehouseOpsApi.packages(transfer.id),
      ]);
      setPacking({
        transfer: full,
        existing,
        packageType: 'Carton',
        weightKg: '',
        items: (full.StockTransferItems || []).map((i) => ({
          productId: i.productId,
          productName: i.Product?.productName,
          picked: Number(i.pickedQty || 0),
          quantity: '',
        })),
      });
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open packing', 'error');
    }
  };

  const confirmPack = async () => {
    setBusy(true);
    try {
      await warehouseOpsApi.packCarton(packing.transfer.id, {
        packageType: packing.packageType,
        weightKg: packing.weightKg || null,
        items: packing.items
          .filter((i) => Number(i.quantity) > 0)
          .map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
      });
      showToast('Carton packed');
      openPacking(packing.transfer);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not pack the carton', 'error');
    }
    setBusy(false);
  };

  // ---- Bin to bin ----

  const openMove = (bin) => setMoving({
    fromBinId: bin?.binId || '', toBinId: '', productId: '', quantity: '', contents: [],
  });

  const loadBinContents = async (binId) => {
    try {
      const rows = await warehouseOpsApi.binContents(binId);
      setMoving((m) => ({ ...m, fromBinId: binId, contents: rows, productId: '', quantity: '' }));
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not read the bin', 'error');
    }
  };

  const confirmMove = async () => {
    if (!moveFields.check(moving, showToast)) return;

    setBusy(true);
    try {
      const result = await warehouseOpsApi.move({
        branchId: Number(branchId),
        fromBinId: Number(moving.fromBinId),
        toBinId: Number(moving.toBinId),
        productId: Number(moving.productId),
        quantity: Number(moving.quantity),
      });
      showToast(result.message || 'Moved');
      setMoving(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not move it', 'error');
    }
    setBusy(false);
  };

  // ---- Cycle count ----

  const startCycleCount = async (bin) => {
    setBusy(true);
    try {
      const created = await stockCountsApi.create({ branchId: Number(branchId), binId: bin.binId });
      showToast(`Cycle count ${created.countNumber} opened for bin ${bin.code}`);
      setCounting(created);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not start a count', 'error');
    }
    setBusy(false);
  };

  // ---- Locate ----

  const runLocate = async () => {
    if (!locate.query) return;
    try {
      const products = await warehousesApi.contents(branchId, { limit: 300 });
      const match = (products?.data || []).find((row) => (
        String(row.Product?.productName || '').toLowerCase().includes(locate.query.toLowerCase())
        || String(row.Product?.sku || '').toLowerCase().includes(locate.query.toLowerCase())
      ));
      if (!match) { setLocate({ ...locate, results: [] }); return; }
      setLocate({ ...locate, results: await warehouseOpsApi.locate(match.productId, { branchId }) });
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not locate it', 'error');
    }
  };

  const binsInUse = queue?.binsInUse;

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Warehouse Floor"
        subtitle="Put stock away, pick it for dispatch, and pack it into cartons"
        icon={<WarehouseIcon />}
      />

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={5}>
            <TextField
              select fullWidth size="small" label="Location" value={branchId}
              onChange={(e) => setBranchId(e.target.value)} InputLabelProps={{ shrink: true }}
            >
              {locations.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.branchName}{l.locationType === 'Warehouse' ? ' (Warehouse)' : ''}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {!loading && !binsInUse && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          <strong>This location does not use bins.</strong> Receiving, transfers, counting and valuation all
          work without them — set up zones and bins under Warehouses only if you need to record whereabouts
          in the building stock is kept.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}>
          <StatsCard title="To put away" value={queue?.items?.length ?? 0} detail="Products in the receiving bay"
            icon={<MoveToInboxIcon />} gradient={queue?.items?.length ? 'warning' : 'success'} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatsCard title="Bins" value={bins.length} detail="Zones, racks and bins" icon={<Inventory2Icon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatsCard title="To pick" value={transfers.filter((t) => t.status === 'Approved').length}
            detail="Transfers awaiting picking" icon={<ShoppingBasketIcon />} gradient="info" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatsCard title="To pack" value={transfers.filter((t) => t.status === 'Picked').length}
            detail="Picked, awaiting cartons" icon={<Inventory2Icon />} gradient="warning" />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          {/* Ordered the way the day runs: goods in, orders out, then the
              housekeeping that keeps both possible. */}
          <Tab label={`Put-away${queue?.items?.length ? ` (${queue.items.length})` : ''}`} />
          <Tab label="Orders" />
          <Tab label={`Transfers${transfers.length ? ` (${transfers.length})` : ''}`} />
          <Tab label={`Bins${occupancy?.overCapacity ? ` (${occupancy.overCapacity} full)` : ''}`} />
          <Tab label="Put-away rules" />
          <Tab label="Find stock" />
        </Tabs>
      </Paper>

      {loading ? <Loader /> : (
        <>
          {tab === 0 && (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>At location</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Already binned</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>To put away</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(queue?.items || []).map((item) => (
                      <TableRow key={item.productId} hover>
                        <TableCell>
                          <Typography variant="body2">{item.productName}</Typography>
                          {item.sku && <Typography variant="caption" color="text.secondary">{item.sku}</Typography>}
                        </TableCell>
                        <TableCell align="right">{item.onHand}</TableCell>
                        <TableCell align="right">{item.binned}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color="warning.main">
                            {item.toPutAway} {item.unit}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" variant="outlined" disabled={!bins.length}
                            onClick={() => openPutAway(item)} sx={{ borderRadius: 2 }}>
                            Put away
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!(queue?.items || []).length && (
                      <TableRow><TableCell colSpan={5}>
                        <Typography variant="body2" color="success.main" align="center" sx={{ py: 3 }}>
                          Nothing waiting — everything at this location is on a shelf.
                        </Typography>
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </Paper>
          )}

          {tab === 1 && (
            <OrderFulfilment branchId={branchId} onChanged={load} />
          )}

          {tab === 2 && (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Transfer</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>To</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Quantity</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transfers.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>{t.transferNumber}</Typography>
                        <Typography variant="caption" color="text.secondary">{t.transferDate}</Typography>
                      </TableCell>
                      <TableCell>{t.toBranch?.branchName || `#${t.toBranchId}`}</TableCell>
                      <TableCell align="right">{Number(t.totalQuantity || 0)}</TableCell>
                      <TableCell><StatusChip status={t.status} /></TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Button size="small" variant="outlined" onClick={() => openPickList(t)} sx={{ borderRadius: 2 }}>
                            Pick list
                          </Button>
                          {t.status === 'Picked' && (
                            <Button size="small" onClick={() => openPacking(t)} sx={{ borderRadius: 2 }}>
                              Pack
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!transfers.length && (
                    <TableRow><TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                        Nothing approved and waiting to leave this location.
                      </Typography>
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>
          )}

          {tab === 3 && (
            <Stack spacing={2}>
              {replenish?.hasWork && (
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                  <strong>{replenish.overfull.length} bin{replenish.overfull.length === 1 ? ' is' : 's are'} over capacity.</strong>{' '}
                  {replenish.withRoom.length
                    ? `There is room in ${replenish.withRoom.slice(0, 3).map((b) => b.code).join(', ')}.`
                    : 'No bin with a stated capacity has room — consider adding shelving.'}
                </Alert>
              )}

              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <StatsCard title="Bins" value={occupancy?.total ?? 0} detail="Active locations"
                    icon={<Inventory2Icon />} gradient="primary" />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <StatsCard title="Empty" value={occupancy?.empty ?? 0} detail="Ready for stock"
                    icon={<Inventory2Icon />} gradient="success" />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <StatsCard title="Over capacity" value={occupancy?.overCapacity ?? 0} detail="Need rebalancing"
                    icon={<Inventory2Icon />} gradient={occupancy?.overCapacity ? 'danger' : 'success'} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <StatsCard
                    title="Average fill"
                    value={occupancy?.averageOccupancy === null || occupancy?.averageOccupancy === undefined
                      ? '—' : `${occupancy.averageOccupancy}%`}
                    detail={occupancy?.unmeasured
                      ? `${occupancy.unmeasured} bin(s) have no capacity set`
                      : 'Across measured bins'}
                    icon={<Inventory2Icon />} gradient="info"
                  />
                </Grid>
              </Grid>

              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Bin</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Holding</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Capacity</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 150 }}>Fill</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(occupancy?.bins || []).map((bin) => (
                        <TableRow key={bin.binId} hover>
                          <TableCell>
                            <Chip label={bin.code} size="small" sx={{ fontFamily: 'monospace', mr: 1 }} />
                            <Typography component="span" variant="body2">{bin.name || bin.level}</Typography>
                            {bin.products > 0 && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {bin.products} product{bin.products === 1 ? '' : 's'}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right"><strong>{bin.quantity}</strong></TableCell>
                          <TableCell align="right">{bin.capacity ?? '—'}</TableCell>
                          <TableCell>
                            {bin.occupancy === null ? (
                              <Typography variant="caption" color="text.disabled">not measured</Typography>
                            ) : (
                              <Box>
                                <LinearProgress
                                  variant="determinate"
                                  value={Math.min(bin.occupancy, 100)}
                                  color={bin.overCapacity ? 'error' : bin.occupancy > 80 ? 'warning' : 'success'}
                                  sx={{ height: 6, borderRadius: 3 }}
                                />
                                <Typography variant="caption"
                                  color={bin.overCapacity ? 'error.main' : 'text.secondary'}>
                                  {bin.occupancy}%{bin.overCapacity ? ' — over' : ''}
                                </Typography>
                              </Box>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Button size="small" disabled={bin.empty}
                                onClick={() => { openMove(bin); loadBinContents(bin.binId); }}>
                                Move
                              </Button>
                              <Button size="small" disabled={bin.empty || busy}
                                onClick={() => startCycleCount(bin)}>
                                Count
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!(occupancy?.bins || []).length && (
                        <TableRow><TableCell colSpan={5}>
                          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                            No bins here. Set up zones and bins under Warehouses if you want to track
                            whereabouts in the building stock is kept.
                          </Typography>
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Box>
              </Paper>
            </Stack>
          )}

          {tab === 4 && (
            <PutAwayRules branchId={branchId} bins={bins} />
          )}

          {tab === 5 && (
            <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <TextField
                  fullWidth size="small" label="Product name or SKU" value={locate.query}
                  onChange={(e) => setLocate({ ...locate, query: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && runLocate()}
                  InputLabelProps={{ shrink: true }}
                />
                <Button variant="contained" startIcon={<SearchIcon />} onClick={runLocate} sx={{ borderRadius: 2 }}>
                  Find
                </Button>
              </Stack>

              {locate.results && (
                locate.results.length ? (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Bin</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Lot</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Expires</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Quantity</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {locate.results.map((row, i) => (
                        <TableRow key={i} hover>
                          <TableCell>
                            <Chip label={row.binCode} size="small" sx={{ fontFamily: 'monospace', mr: 1 }} />
                            {row.binName}
                          </TableCell>
                          <TableCell>{row.batchNumber || '—'}</TableCell>
                          <TableCell>{row.expiryDate || '—'}</TableCell>
                          <TableCell align="right"><strong>{row.quantity}</strong></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                    Not in any bin at this location — it may still be in the receiving bay.
                  </Typography>
                )
              )}
            </Paper>
          )}
        </>
      )}

      {/* Put-away */}
      <Modal open={Boolean(placing)} title="Put away" onClose={() => setPlacing(null)} maxWidth="xs">
        {placing && (
          <Stack spacing={2}>
            <Typography variant="body2">
              <strong>{placing.productName}</strong> — {placing.toPutAway} {placing.unit} waiting.
            </Typography>
            <TextField
              select fullWidth size="small" label="Into bin" {...putAwayFields.fieldProps('binId', placing)} value={placing.binId}
              onChange={(e) => setPlacing({ ...placing, binId: e.target.value })}
              InputLabelProps={{ shrink: true }}
            >
              {bins.map((bin) => (
                <MenuItem key={bin.id} value={bin.id}>{bin.path} — {bin.level}</MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth size="small" type="number" label="Quantity" {...putAwayFields.fieldProps('quantity', placing)} value={placing.quantity}
              onChange={(e) => setPlacing({ ...placing, quantity: e.target.value })}
              inputProps={{ min: 0, max: placing.toPutAway, step: 'any' }}
              InputLabelProps={{ shrink: true }}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setPlacing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button variant="contained" disabled={busy || !placing.binId || !(Number(placing.quantity) > 0)}
                onClick={confirmPutAway} sx={{ borderRadius: 2 }}>
                {busy ? 'Placing…' : 'Put away'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Pick list */}
      <Modal open={Boolean(pickList)} title={`Pick list — ${pickList?.transferNumber || ''}`}
        onClose={() => setPickList(null)} maxWidth="md">
        {pickList && (
          <Stack spacing={2}>
            {pickList.note && <Alert severity="info" sx={{ borderRadius: 2 }}>{pickList.note}</Alert>}

            {pickList.lines.map((line) => (
              <Paper key={line.itemId} variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Box>
                    <Typography variant="body2" fontWeight={700}>{line.productName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Need {line.outstanding} {line.unit}
                      {line.alreadyPicked > 0 ? ` · ${line.alreadyPicked} already picked` : ''}
                    </Typography>
                  </Box>
                  {!line.complete && line.shortfall > 0 && (
                    <Chip label={`${line.shortfall} short`} size="small" color="warning" />
                  )}
                </Stack>

                {line.picks.length ? (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Go to</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Lot</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>In bin</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Take</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {line.picks.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Chip label={p.binCode} size="small" sx={{ fontFamily: 'monospace' }} />
                          </TableCell>
                          <TableCell>
                            {p.batchNumber || '—'}
                            {p.expiryDate && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                exp {p.expiryDate}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">{p.available}</TableCell>
                          <TableCell align="right"><strong>{p.pick}</strong></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {pickList.binsInUse
                      ? 'Not in any bin — it may still be in the receiving bay.'
                      : 'No bins at this location.'}
                  </Typography>
                )}
              </Paper>
            ))}

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setPickList(null)} variant="outlined" sx={{ borderRadius: 2 }}>Close</Button>
              <Button variant="contained" disabled={busy} onClick={confirmPick} sx={{ borderRadius: 2 }}>
                {busy ? 'Confirming…' : 'Confirm pick'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Bin to bin */}
      <Modal open={Boolean(moving)} title="Move between bins" onClose={() => setMoving(null)} maxWidth="xs">
        {moving && (
          <Stack spacing={2}>
            <TextField
              select fullWidth size="small" label="From bin" {...moveFields.fieldProps('fromBinId', moving)} value={moving.fromBinId}
              onChange={(e) => loadBinContents(e.target.value)} InputLabelProps={{ shrink: true }}
            >
              {bins.map((bin) => <MenuItem key={bin.id} value={bin.id}>{bin.path}</MenuItem>)}
            </TextField>

            <TextField
              select fullWidth size="small" label="Product" value={moving.productId}
              onChange={(e) => {
                const row = moving.contents.find((c) => String(c.productId) === String(e.target.value));
                setMoving({ ...moving, productId: e.target.value, quantity: row ? Number(row.quantity) : '' });
              }}
              InputLabelProps={{ shrink: true }}
              disabled={!moving.contents.length}
              helperText={moving.contents.length ? ' ' : 'This bin is empty'}
            >
              {moving.contents.map((row) => (
                <MenuItem key={row.id} value={row.productId}>
                  {row.Product?.productName} — {Number(row.quantity)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select fullWidth size="small" label="To bin" {...moveFields.fieldProps('toBinId', moving)} value={moving.toBinId}
              onChange={(e) => setMoving({ ...moving, toBinId: e.target.value })}
              InputLabelProps={{ shrink: true }}
            >
              {bins.filter((b) => String(b.id) !== String(moving.fromBinId))
                .map((bin) => <MenuItem key={bin.id} value={bin.id}>{bin.path}</MenuItem>)}
            </TextField>

            <TextField
              fullWidth size="small" type="number" label="Quantity" {...moveFields.fieldProps('quantity', moving)} value={moving.quantity}
              onChange={(e) => setMoving({ ...moving, quantity: e.target.value })}
              inputProps={{ min: 0, step: 'any' }} InputLabelProps={{ shrink: true }}
            />

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setMoving(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button
                variant="contained" sx={{ borderRadius: 2 }}
                disabled={busy || !moving.fromBinId || !moving.toBinId || !moving.productId || !(Number(moving.quantity) > 0)}
                onClick={confirmMove}
              >
                {busy ? 'Moving…' : 'Move'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Cycle count started */}
      <Modal open={Boolean(counting)} title={`Cycle count ${counting?.countNumber || ''}`}
        onClose={() => setCounting(null)} maxWidth="xs">
        {counting && (
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              A count sheet has been opened for this bin with{' '}
              <strong>{counting.StockCountItems?.length || 0}</strong> line(s). Enter what you physically
              find on Stock Counting — approving it corrects both the bin and the location.
            </Alert>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setCounting(null)} variant="outlined" sx={{ borderRadius: 2 }}>Later</Button>
              <Button variant="contained" sx={{ borderRadius: 2 }}
                onClick={() => navigate('/stock-counts')}>
                Go and count
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* Packing */}
      <Modal open={Boolean(packing)} title={`Pack — ${packing?.transfer?.transferNumber || ''}`}
        onClose={() => { setPacking(null); load(); }} maxWidth="md">
        {packing && (
          <Stack spacing={2}>
            {packing.existing.length > 0 && (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                {packing.existing.length} package{packing.existing.length === 1 ? '' : 's'} already made up:{' '}
                {packing.existing.map((p) => p.packageNumber).join(', ')}
              </Alert>
            )}

            <Grid container spacing={1.5}>
              <Grid item xs={6} sm={4}>
                <TextField select fullWidth size="small" label="Package type" value={packing.packageType}
                  onChange={(e) => setPacking({ ...packing, packageType: e.target.value })}
                  InputLabelProps={{ shrink: true }}>
                  {['Carton', 'Sack', 'Bundle', 'Pallet', 'Crate'].map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField fullWidth size="small" type="number" label="Weight (kg)" value={packing.weightKg}
                  onChange={(e) => setPacking({ ...packing, weightKg: e.target.value })}
                  inputProps={{ min: 0, step: 'any' }} InputLabelProps={{ shrink: true }} />
              </Grid>
            </Grid>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Picked</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Into this package</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {packing.items.map((item, index) => (
                  <TableRow key={item.productId}>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell align="right">{item.picked}</TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small" type="number" sx={{ width: 110 }} value={item.quantity}
                        onChange={(e) => setPacking({
                          ...packing,
                          items: packing.items.map((it, i) => (
                            i === index ? { ...it, quantity: e.target.value } : it
                          )),
                        })}
                        inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' } }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => { setPacking(null); load(); }} variant="outlined" sx={{ borderRadius: 2 }}>
                Done
              </Button>
              <Button variant="contained" disabled={busy || !packing.items.some((i) => Number(i.quantity) > 0)}
                onClick={confirmPack} sx={{ borderRadius: 2 }}>
                {busy ? 'Packing…' : 'Pack this carton'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
