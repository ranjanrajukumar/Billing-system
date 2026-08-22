import AddIcon from '@mui/icons-material/Add';
import OutboxIcon from '@mui/icons-material/Outbox';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import ScheduleIcon from '@mui/icons-material/Schedule';
import {
  Alert, Box, Button, Chip, Grid, MenuItem, Stack, Switch,
  FormControlLabel, TextField, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import DocumentLines, { incompleteLines } from '../../components/DocumentLines.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchableSelect from '../../components/SearchableSelect.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  departmentsApi, productsApi, stockIssuesApi, usersApi,
} from '../../services/resource.service.js';
import useRequiredFields from '../../hooks/useRequiredFields.js';

/**
 * Store Issue Voucher — material leaving the store with no sale behind it.
 *
 * The screen is built around one number: how much of each voucher is still out.
 * Everything else is in service of it, because that is the question the
 * document exists to answer and the reason an issue is not just a stock
 * adjustment with a note on it.
 */

const PURPOSES = ['Consumption', 'Maintenance', 'Production', 'Repair', 'Sample', 'Loan', 'Other'];

const blankLine = { productId: '', quantity: '', unitCost: '' };

// What a voucher cannot be saved without. The recipient is checked separately
// below, because it is satisfied by any one of four fields rather than by all
// of them — a rule no single field can carry.
const ISSUE_REQUIRED = [{ name: 'issueDate', label: 'Issue date' }];

const ISSUE_COLUMNS = [
  { key: 'quantity', label: 'Qty', type: 'number', width: 110, required: true, positive: true },
  { key: 'unitCost', label: 'Unit Cost', type: 'number', width: 130 },
];

/** Who has it, in the order somebody scanning a list would want to read it. */
function recipientOf(issue) {
  return [
    issue.Department?.name,
    issue.issuedTo?.name || issue.issuedToName,
    issue.jobNumber,
  ].filter(Boolean).join(' · ') || '—';
}

export default function StockIssues() {
  const [rows, setRows] = useState([]);
  const [outstanding, setOutstanding] = useState({ data: [], totals: {} });
  const [departments, setDepartments] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [returning, setReturning] = useState(null);
  const [filter, setFilter] = useState({ status: '' });
  const [lineErrors, setLineErrors] = useState(false);
  const { showToast } = useToast();
  const issueFields = useRequiredFields(ISSUE_REQUIRED);

  const load = async () => {
    setLoading(true);
    try {
      const [list, still, depts, prods, people] = await Promise.all([
        stockIssuesApi.list({ limit: 100, ...filter }),
        stockIssuesApi.outstanding(),
        departmentsApi.list({ limit: 200 }),
        productsApi.list({ limit: 500 }),
        usersApi.list({ limit: 200 }),
      ]);
      setRows(list?.data || []);
      setOutstanding(still || { data: [], totals: {} });
      setDepartments(depts?.data || []);
      setProducts(prods?.data || []);
      setUsers(people?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to load store issues', 'error');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [filter.status]);

  const openBlank = () => {
    // A form reopened for a new voucher should not still be red about the last
    // one somebody abandoned.
    issueFields.reset();
    setLineErrors(false);
    setCreating({
      issueDate: new Date().toISOString().slice(0, 10),
      purpose: 'Consumption',
      returnable: true,
      departmentId: '', issuedToUserId: '', issuedToName: '', jobNumber: '', remarks: '',
      items: [{ ...blankLine }],
    });
  };

  const usableLines = (items) => items.filter((i) => i.productId && Number(i.quantity) > 0);

  // The server refuses an issue with no recipient; saying so before the round
  // trip is what stops somebody filling in ten lines and then being told.
  const hasRecipient = (draft) => Boolean(
    draft.departmentId || draft.issuedToUserId
    || (draft.issuedToName || '').trim() || (draft.jobNumber || '').trim(),
  );

  const submit = async () => {
    if (!issueFields.check(creating, showToast)) return;

    setLineErrors(true);
    if (incompleteLines(creating.items, ISSUE_COLUMNS).length) {
      showToast('Every line needs a product and a quantity greater than zero', 'error');
      return;
    }
    if (!usableLines(creating.items).length) {
      showToast('Add at least one product with a quantity', 'error');
      return;
    }
    setBusy(true);
    try {
      await stockIssuesApi.create({
        ...creating,
        departmentId: creating.departmentId ? Number(creating.departmentId) : null,
        issuedToUserId: creating.issuedToUserId ? Number(creating.issuedToUserId) : null,
        items: usableLines(creating.items).map((i) => ({
          productId: Number(i.productId),
          quantity: Number(i.quantity),
          unitCost: i.unitCost ? Number(i.unitCost) : null,
        })),
      });
      showToast('Saved as a draft — issue it from the list to take the material out');
      setCreating(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the issue', 'error');
    }
    setBusy(false);
  };

  const act = async (row, action, ...args) => {
    setBusy(true);
    try {
      await stockIssuesApi[action](row.id, ...args);
      showToast({
        issue: `${row.issueNumber} issued — the material is out of the store`,
        close: `${row.issueNumber} closed — nothing more is expected back`,
        remove: 'Draft cancelled',
      }[action]);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'That could not be done', 'error');
    }
    setBusy(false);
  };

  /** Opens the return form pre-filled with everything still out on the voucher. */
  const openReturn = async (row) => {
    try {
      const issue = await stockIssuesApi.get(row.id);
      const lines = (issue.StockIssueItems || [])
        .filter((item) => Number(item.outstanding) > 0)
        .map((item) => ({
          issueItemId: item.id,
          // DocumentLines names the product from `productId` against its
          // catalogue, so the line carries the id rather than a copied name.
          productId: item.productId,
          batchNumber: item.batchNumber,
          outstanding: Number(item.outstanding),
          quantity: '',
          condition: 'Good',
        }));
      if (!lines.length) {
        showToast('Nothing is still out on this voucher', 'info');
        return;
      }
      setReturning({ issue, returnDate: new Date().toISOString().slice(0, 10), remarks: '', lines });
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not open the voucher', 'error');
    }
  };

  const submitReturn = async (andPost) => {
    const lines = returning.lines.filter((l) => Number(l.quantity) > 0);
    if (!lines.length) {
      showToast('Enter a quantity against at least one line', 'error');
      return;
    }
    const over = lines.find((l) => Number(l.quantity) > l.outstanding);
    if (over) {
      const name = products.find((p) => p.id === over.productId)?.productName || 'that line';
      showToast(`Only ${over.outstanding} of ${name} is still out`, 'error');
      return;
    }

    setBusy(true);
    try {
      const document = await stockIssuesApi.returns.create(returning.issue.id, {
        returnDate: returning.returnDate,
        remarks: returning.remarks,
        items: lines.map((l) => ({
          issueItemId: l.issueItemId,
          quantity: Number(l.quantity),
          condition: l.condition,
        })),
      });
      if (andPost) {
        await stockIssuesApi.returns.post(document.id);
        showToast(`${document.returnNumber} posted — good material is back in stock`);
      } else {
        showToast(`${document.returnNumber} saved as a draft — post it to put the stock back`);
      }
      setReturning(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not record the return', 'error');
    }
    setBusy(false);
  };

  const stats = useMemo(() => ({
    drafts: rows.filter((r) => r.status === 'Draft').length,
    issued: rows.filter((r) => r.status === 'Issued').length,
    vouchers: outstanding.totals?.vouchers || 0,
    units: outstanding.totals?.units || 0,
  }), [rows, outstanding]);

  // The voucher that has been out longest, which is the one worth chasing.
  const oldest = outstanding.data?.[0];

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Store Issue (SIV)"
        subtitle="Material leaving the store to a department, a person or a job"
        icon={<OutboxIcon />}
        action={<Button startIcon={<AddIcon />} variant="contained" onClick={openBlank}>New Issue</Button>}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatsCard title="Drafts" value={stats.drafts} detail="Not yet issued" icon={<OutboxIcon />} gradient="warning" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Issued" value={stats.issued} detail="Material is out" icon={<OutboxIcon />} gradient="info" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard title="Still Out" value={stats.units} detail={`Across ${stats.vouchers} voucher(s)`} icon={<AssignmentReturnIcon />} gradient="primary" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatsCard
            title="Longest Outstanding"
            value={oldest ? `${oldest.daysOut}d` : '—'}
            detail={oldest ? oldest.issueNumber : 'Nothing outstanding'}
            icon={<ScheduleIcon />}
            gradient={oldest && oldest.daysOut > 30 ? 'error' : 'success'}
          />
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          select size="small" label="Status" value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All Statuses</MenuItem>
          {['Draft', 'Issued', 'Closed', 'Cancelled'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      </Stack>

      {loading ? <Loader /> : (
        <DataTable
          mobileKeyField="issueNumber"
          rows={rows}
          columns={[
            { field: 'issueNumber', headerName: 'Issue #', render: (r) => (
              <Box>
                <Typography fontWeight={700} variant="body2">{r.issueNumber}</Typography>
                <Typography variant="caption" color="text.secondary">{r.issueDate}</Typography>
              </Box>
            )},
            { field: 'recipient', headerName: 'Issued To', render: recipientOf },
            { field: 'purpose', headerName: 'Purpose', render: (r) => (
              <Chip label={r.purpose} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            )},
            { field: 'progress', headerName: 'Still Out', render: (r) => {
              const p = r.progress || {};
              if (r.status === 'Draft') return <Typography variant="body2" color="text.disabled">—</Typography>;
              return (
                <Box>
                  <Typography variant="body2" fontWeight={700} color={p.outstanding > 0 ? 'warning.main' : 'success.main'}>
                    {p.outstanding} of {p.issued}
                  </Typography>
                  {(p.returned > 0 || p.scrapped > 0 || p.consumed > 0) && (
                    <Typography variant="caption" color="text.secondary">
                      {[
                        p.returned > 0 && `${p.returned} returned`,
                        p.scrapped > 0 && `${p.scrapped} damaged`,
                        p.consumed > 0 && `${p.consumed} used`,
                      ].filter(Boolean).join(', ')}
                    </Typography>
                  )}
                </Box>
              );
            }},
            { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
          ]}
          actions={[
            { label: 'View', onClick: (r) => stockIssuesApi.get(r.id).then(setViewing) },
            { label: 'Issue Material', color: 'success', show: (r) => r.status === 'Draft', onClick: (r) => act(r, 'issue') },
            { label: 'Return Items', color: 'primary', show: (r) => r.status === 'Issued', onClick: openReturn },
            { label: 'Close Off', show: (r) => r.status === 'Issued', onClick: (r) => act(r, 'close', 'Remainder consumed') },
            { label: 'Cancel', color: 'error', show: (r) => r.status === 'Draft', onClick: (r) => act(r, 'remove') },
          ]}
        />
      )}

      {/* ---- New issue ---- */}
      <Modal open={!!creating} onClose={() => setCreating(null)} title="New Store Issue" maxWidth="md">
        {creating && (
          <Stack spacing={3}>
            <Alert severity="info">
              A draft moves no stock. Issue it from the list once the lines are right — that is the step
              that takes the material out of the store.
            </Alert>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth size="small" type="date" label="Issue Date"
                  InputLabelProps={{ shrink: true }}
                  value={creating.issueDate}
                  {...issueFields.fieldProps('issueDate', creating)}
                  onChange={(e) => setCreating({ ...creating, issueDate: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  select fullWidth size="small" label="Purpose" value={creating.purpose}
                  onChange={(e) => setCreating({ ...creating, purpose: e.target.value })}
                >
                  {PURPOSES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControlLabel
                  control={(
                    <Switch
                      checked={creating.returnable}
                      onChange={(e) => setCreating({ ...creating, returnable: e.target.checked })}
                    />
                  )}
                  label="Expect it back"
                />
              </Grid>

              <Grid item xs={12}>
                <Alert severity={hasRecipient(creating) ? 'success' : 'warning'} sx={{ py: 0.25 }}>
                  {hasRecipient(creating)
                    ? 'Recipient recorded.'
                    : 'Say who the material is going to — any one of the four below will do.'}
                </Alert>
              </Grid>

              <Grid item xs={12} sm={6}>
                {/* SearchableSelect works in whole options, not ids — the id is
                    pulled out on the way into state and looked back up on the
                    way out, so the control always has the object it compares. */}
                <SearchableSelect
                  label="Department / Cost Centre" options={departments} size="small"
                  value={departments.find((d) => d.id === creating.departmentId) || null}
                  onChange={(option) => setCreating({ ...creating, departmentId: option?.id || '' })}
                  getOptionLabel={(o) => o.name}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <SearchableSelect
                  label="Issued To (staff)" options={users} size="small"
                  value={users.find((u) => u.id === creating.issuedToUserId) || null}
                  onChange={(option) => setCreating({ ...creating, issuedToUserId: option?.id || '' })}
                  getOptionLabel={(o) => o.name}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" label="Issued To (name)"
                  helperText="For somebody who is not a system user"
                  value={creating.issuedToName}
                  onChange={(e) => setCreating({ ...creating, issuedToName: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" label="Job / Work Order No"
                  value={creating.jobNumber}
                  onChange={(e) => setCreating({ ...creating, jobNumber: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth size="small" label="Remarks"
                  value={creating.remarks}
                  onChange={(e) => setCreating({ ...creating, remarks: e.target.value })}
                />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" color="text.secondary" textTransform="uppercase">Items Issued</Typography>
            <DocumentLines
              lines={creating.items}
              products={products}
              emptyLine={blankLine}
              showErrors={lineErrors}
              onChange={(items) => setCreating({ ...creating, items })}
              columns={ISSUE_COLUMNS}
            />

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button onClick={() => setCreating(null)} disabled={busy}>Cancel</Button>
              <Button
                variant="contained" onClick={submit}
                disabled={busy || !hasRecipient(creating) || !usableLines(creating.items).length}
              >
                {busy ? 'Saving…' : 'Save Draft'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* ---- Return material ---- */}
      <Modal
        open={!!returning} onClose={() => setReturning(null)} maxWidth="md"
        title={`Return against ${returning?.issue?.issueNumber || ''}`}
      >
        {returning && (
          <Stack spacing={3}>
            <Alert severity="info">
              Good material goes back on the shelf. Damaged material is written off — it closes the line
              without returning to stock, because it is not stock any more.
            </Alert>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" type="date" label="Return Date"
                  InputLabelProps={{ shrink: true }}
                  value={returning.returnDate}
                  onChange={(e) => setReturning({ ...returning, returnDate: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth size="small" label="Remarks"
                  value={returning.remarks}
                  onChange={(e) => setReturning({ ...returning, remarks: e.target.value })}
                />
              </Grid>
            </Grid>

            {/* DocumentLines rather than DataTable: the lines are an editable
                grid whose order must not change, and DataTable sorts and
                filters what it is given. `readOnly` locks the product column
                and hides add/remove — a return cannot invent a line — while
                the two columns below stay editable through their renderers. */}
            <DocumentLines
              lines={returning.lines}
              products={products}
              readOnly
              onChange={(lines) => setReturning({ ...returning, lines })}
              columns={[
                { key: 'batchNumber', label: 'Batch', align: 'left', render: (l) => (
                  <Typography variant="body2" color="text.secondary">{l.batchNumber || '—'}</Typography>
                )},
                { key: 'outstanding', label: 'Still Out', render: (l) => (
                  <Typography variant="body2" fontWeight={700}>{l.outstanding}</Typography>
                )},
                { key: 'quantity', label: 'Returning', width: 120, render: (l, index, update) => (
                  <TextField
                    size="small" type="number" sx={{ width: 110 }}
                    value={l.quantity}
                    inputProps={{ min: 0, max: l.outstanding, step: 'any', style: { textAlign: 'right' } }}
                    error={Number(l.quantity) > l.outstanding}
                    onChange={(e) => update(index, { quantity: e.target.value })}
                  />
                )},
                { key: 'condition', label: 'Condition', width: 140, render: (l, index, update) => (
                  <TextField
                    select size="small" sx={{ width: 130 }} value={l.condition}
                    onChange={(e) => update(index, { condition: e.target.value })}
                  >
                    <MenuItem value="Good">Good</MenuItem>
                    <MenuItem value="Damaged">Damaged</MenuItem>
                  </TextField>
                )},
              ]}
            />

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button onClick={() => setReturning(null)} disabled={busy}>Cancel</Button>
              <Button onClick={() => submitReturn(false)} disabled={busy}>Save Draft</Button>
              <Button variant="contained" onClick={() => submitReturn(true)} disabled={busy}>
                {busy ? 'Working…' : 'Return & Post'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Modal>

      {/* ---- View ---- */}
      <Modal
        open={!!viewing} onClose={() => setViewing(null)} maxWidth="md"
        title={`Store Issue: ${viewing?.issueNumber || ''}`}
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
                <Typography>{viewing.issueDate}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Purpose</Typography>
                <Typography>{viewing.purpose}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Expect Back</Typography>
                <Typography>{viewing.returnable ? 'Yes' : 'No — consumable'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Issued To</Typography>
                <Typography>{recipientOf(viewing)}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Issued By</Typography>
                <Typography>
                  {viewing.issuer?.name || '—'}
                  {viewing.issuedAt ? ` at ${new Date(viewing.issuedAt).toLocaleString()}` : ''}
                </Typography>
              </Grid>
              {viewing.remarks && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Remarks</Typography>
                  <Typography>{viewing.remarks}</Typography>
                </Grid>
              )}
            </Grid>

            <Typography variant="subtitle2" color="text.secondary" textTransform="uppercase">Lines</Typography>
            <DataTable
              rows={viewing.StockIssueItems || []}
              columns={[
                { field: 'product', headerName: 'Product', render: (r) => r.Product?.productName },
                { field: 'batch', headerName: 'Batch', render: (r) => r.batchNumber || '—' },
                { field: 'quantity', headerName: 'Issued', render: (r) => r.quantity },
                { field: 'returned', headerName: 'Returned', render: (r) => r.returnedQty },
                { field: 'scrapped', headerName: 'Damaged', render: (r) => r.scrappedQty },
                { field: 'consumed', headerName: 'Used', render: (r) => r.closedQty },
                { field: 'outstanding', headerName: 'Still Out', render: (r) => (
                  <Typography variant="body2" fontWeight={700} color={Number(r.outstanding) > 0 ? 'warning.main' : 'success.main'}>
                    {r.outstanding}
                  </Typography>
                )},
              ]}
            />

            {!!(viewing.StockIssueReturns || []).length && (
              <>
                <Typography variant="subtitle2" color="text.secondary" textTransform="uppercase">Returns</Typography>
                <DataTable
                  rows={viewing.StockIssueReturns}
                  columns={[
                    { field: 'returnNumber', headerName: 'Return #', render: (r) => r.returnNumber },
                    { field: 'returnDate', headerName: 'Date', render: (r) => r.returnDate },
                    { field: 'lines', headerName: 'Lines', render: (r) => (r.StockIssueReturnItems || []).length },
                    { field: 'status', headerName: 'Status', render: (r) => <StatusChip status={r.status} /> },
                  ]}
                />
              </>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
