import { Op, literal } from 'sequelize';
import {
  ApprovalRequest, CashRegister, Expense, Gatepass, Grn, Invoice,
  JournalEntry, PickWave, Purchase, PurchaseOrder, PurchaseReturn, QcInspection,
  Quotation, ReplenishmentRecommendation, SalesOrder, SalesReturn, Shipment,
  StockAdjustment, StockCount, StockIssue, StockIssueItem, StockIssueReturn,
  StockTransfer, WarehouseException, WarehouseTask,
  Device, RfidTag, SensorReading, SensorThreshold,
} from '../../models/index.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { live } from '../../utils/query.js';
import { DISPATCHED_STATES } from '../sales/salesOrderLink.service.js';

/**
 * What each process actually looks like right now.
 *
 * The menu nests documents under the flow they belong to; this is what makes
 * that nesting worth more than tidiness. Each stage reports the count of work
 * sitting in it, so the overview answers the question the flat list never
 * could: not "what screens exist" but "where is everything stuck".
 *
 * Two rules about the numbers, both of which matter more than they look:
 *
 * Every count is of work *waiting*, never of work done. "1,412 invoices" is
 * a fact about the last three years and tells nobody what to do this morning;
 * "6 dispatched, not billed" is a list of jobs. A stage with nothing waiting
 * shows zero, and zero is the good answer.
 *
 * Counts are read straight from the documents on each request, never cached or
 * accumulated. A stale queue length is worse than none: it is read as a fact,
 * acted on, and only questioned once somebody has wasted an afternoon on a
 * stage that emptied yesterday.
 */

/** Every stage carries the same shape, so the client renders them uniformly. */
const stage = (key, label, path, count, hint) => ({ key, label, path, count, hint });

/**
 * Scopes a count to the locations this request can see.
 *
 * The overview must agree with the screens it links to. A stage reporting six
 * when the screen behind it lists two — because one counted company-wide and
 * the other by branch — makes the whole page untrustworthy, and the reader is
 * right not to trust it.
 *
 * This was a second implementation of `scopedWhere`, identical to it and free
 * to drift from it. Two functions that must agree about who can see what are
 * one function; the name is kept as a local alias only because it reads better
 * at the twenty call sites below.
 */
const scoped = scopedWhere;

/**
 * Orders whose goods have gone but which nobody has billed.
 *
 * The stage that only exists because the two systems are linked. Before the
 * sales order carried an invoice, this question had no answer that did not
 * involve somebody reading down two screens side by side — which is exactly
 * the kind of reconciliation that quietly stops happening in a busy week, and
 * the revenue goes out of the door with the van.
 */
async function dispatchedNotBilled(req) {
  return SalesOrder.count({
    where: scoped(req, live({
      fulfilmentStatus: { [Op.in]: DISPATCHED_STATES },
      // A cancelled invoice releases the order to be billed again, so it must
      // not count as billed here either. `detstatus = 0` rather than `false`:
      // MySQL stores the flag as a TINYINT and SQLite as an integer, and 0 is
      // the one spelling both dialects read the same way in raw SQL.
      id: {
        [Op.notIn]: literal(
          '(SELECT sales_order_id FROM invoices '
          + "WHERE sales_order_id IS NOT NULL AND detstatus = 0 AND status <> 'Cancelled')",
        ),
      },
    })),
  });
}

async function orderToCash(req) {
  const [quotes, unallocated, inProgress, unbilled, unpaid, returns] = await Promise.all([
    Quotation.count({ where: scoped(req, live({ status: { [Op.in]: ['Draft', 'Sent'] } })) }),
    SalesOrder.count({ where: scoped(req, live({ status: 'Approved', fulfilmentStatus: 'Pending' })) }),
    SalesOrder.count({
      where: scoped(req, live({
        fulfilmentStatus: { [Op.in]: ['Allocated', 'Picking', 'Picked', 'Packed', 'ReadyToShip'] },
      })),
    }),
    dispatchedNotBilled(req),
    Invoice.count({ where: scoped(req, live({ status: { [Op.in]: ['Draft', 'Unpaid', 'Partially Paid'] } })) }),
    SalesReturn.count({ where: scoped(req, live({ status: 'Pending' })) }),
  ]);

  return {
    key: 'orderToCash',
    title: 'Order to Cash',
    summary: 'From a quotation to money in the bank, and everything the goods do in between.',
    stages: [
      stage('quotations', 'Quotations', '/quotations', quotes, 'Open, awaiting a decision'),
      stage('salesOrders', 'Awaiting allocation', '/sales-orders', unallocated, 'Confirmed, warehouse has not started'),
      stage('fulfilment', 'In fulfilment', '/sales-orders', inProgress, 'Allocated, picking, packing'),
      stage('unbilled', 'Dispatched, not billed', '/sales-orders', unbilled, 'Goods gone, no invoice raised'),
      stage('invoices', 'Awaiting payment', '/invoices', unpaid, 'Unpaid or part paid'),
      stage('salesReturns', 'Returns to process', '/sales-returns', returns, 'Raised, not yet completed'),
    ],
  };
}

async function procureToStock(req) {
  const [approval, awaiting, unposted, qc, unpaid, returns] = await Promise.all([
    PurchaseOrder.count({ where: scoped(req, live({ status: { [Op.in]: ['Draft', 'Pending Approval'] } })) }),
    PurchaseOrder.count({ where: scoped(req, live({ status: { [Op.in]: ['Approved', 'Partially Received'] } })) }),
    // A saved GRN has not moved stock. Posting it is the deliberate act that
    // does, so anything sitting in Draft is goods on the floor that the system
    // still believes are on a lorry.
    Grn.count({ where: scoped(req, live({ status: 'Draft' })) }),
    // Not scoped: a QC inspection is attached to the receipt it came from and
    // carries no location of its own, so there is nothing here to filter by.
    QcInspection.count({ where: live({ status: 'Pending' }) }),
    Purchase.count({ where: scoped(req, live({ status: { [Op.in]: ['Draft', 'Received'] } })) }),
    PurchaseReturn.count({ where: scoped(req, live({ status: 'Draft' })) }),
  ]);

  return {
    key: 'procureToStock',
    title: 'Procure to Stock',
    summary: 'From raising an order on a supplier to the goods being on a shelf and the bill in the books.',
    stages: [
      stage('purchaseOrders', 'Awaiting approval', '/purchase-orders', approval, 'Draft or waiting on a decision'),
      stage('awaitingDelivery', 'Awaiting delivery', '/purchase-orders', awaiting, 'Approved, goods not all in'),
      stage('grn', 'Receipts to post', '/grn', unposted, 'Received but not yet in stock'),
      stage('qcInspections', 'QC pending', '/qc', qc, 'Inspected quantity not yet decided'),
      stage('purchases', 'Bills to settle', '/purchases', unpaid, 'Supplier invoices outstanding'),
      stage('purchaseReturns', 'Returns to confirm', '/purchase-returns', returns, 'Draft, not yet sent back'),
    ],
  };
}

async function issueToReturn(req) {
  const [drafts, out, draftReturns] = await Promise.all([
    StockIssue.count({ where: scoped(req, live({ status: 'Draft' })) }),
    StockIssue.count({ where: scoped(req, live({ status: 'Issued', returnable: true })) }),
    StockIssueReturn.count({ where: scoped(req, live({ status: 'Draft' })) }),
  ]);

  // How much material, rather than how many vouchers. A single voucher with
  // forty items still out is a different problem from forty vouchers with one
  // each, and the count of vouchers cannot tell them apart.
  const outstandingUnits = await StockIssueItem.findAll({
    attributes: ['quantity', 'returnedQty', 'scrappedQty', 'closedQty'],
    where: live(),
    include: [{
      model: StockIssue,
      attributes: [],
      required: true,
      where: scoped(req, live({ status: 'Issued', returnable: true })),
    }],
    raw: true,
  });

  const units = outstandingUnits.reduce((total, item) => total + Math.max(0, (
    Number(item.quantity) - Number(item.returnedQty)
    - Number(item.scrappedQty) - Number(item.closedQty)
  )), 0);

  return {
    key: 'issueToReturn',
    title: 'Issue to Return',
    summary: 'Material leaving the store to a department, a person or a job — and what has not come back.',
    stages: [
      stage('drafts', 'Drafts to issue', '/stock-issues', drafts, 'Saved, material still on the shelf'),
      stage('stockIssues', 'Out with somebody', '/stock-issues', out, 'Issued, still expected back'),
      stage('outstandingUnits', 'Units still out', '/stock-issues', Math.round(units * 10000) / 10000, 'Across all open vouchers'),
      stage('stockIssueReturns', 'Returns to post', '/stock-issue-returns', draftReturns, 'Handed back, not yet in stock'),
    ],
  };
}

/**
 * Planning: what the business intends, and how much of it nobody has acted on.
 *
 * The only chain here whose stages are advice rather than documents. A
 * recommendation is not work that has happened, it is work the system thinks
 * should — so the count that matters is how much of it is still unread, which
 * is the number that quietly grows until the engine is ignored altogether.
 */
async function planToReplenish(req) {
  const [pending, approved, ordering] = await Promise.all([
    ReplenishmentRecommendation.count({ where: scoped(req, live({ status: 'Pending' })) }),
    ReplenishmentRecommendation.count({
      where: scoped(req, live({ status: { [Op.in]: ['Approved', 'Modified'] } })),
    }),
    PurchaseOrder.count({ where: scoped(req, live({ status: { [Op.in]: ['Draft', 'Pending Approval'] } })) }),
  ]);

  return {
    key: 'planToReplenish',
    title: 'Plan to Replenish',
    summary: 'What demand is expected to be, what that says to reorder, and how much of it anybody has acted on.',
    stages: [
      stage('replenishment', 'Recommendations to review', '/replenishment', pending, 'Raised, nobody has decided'),
      stage('approved', 'Approved, not ordered', '/replenishment', approved, 'Accepted, no purchase order yet'),
      stage('purchaseOrders', 'Orders being raised', '/purchase-orders', ordering, 'Draft or awaiting approval'),
    ],
  };
}

/**
 * The warehouse floor, outbound.
 *
 * Includes transfers, which are on none of this process's own screens: a
 * transfer dispatched and not yet received is goods that have left one building
 * and arrived at no other, and that is the warehouse's problem whichever menu
 * entry the document happens to sit under. Confining a stage to the flow's own
 * documents would hide the one case most worth watching.
 */
async function pickToShip(req) {
  const [waves, tasks, exceptions, shipments, atGate, inTransit] = await Promise.all([
    // No location of its own: a wave is defined by the orders on it.
    PickWave.count({ where: live({ status: { [Op.in]: ['Planned', 'Released', 'Picking'] } }) }),
    WarehouseTask.count({
      where: scoped(req, live({ status: { [Op.in]: ['CREATED', 'ASSIGNED', 'IN_PROGRESS'] } })),
    }),
    WarehouseException.count({
      where: scoped(req, live({ status: { [Op.in]: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } })),
    }),
    Shipment.count({ where: live({ status: 'Pending' }) }),
    Gatepass.count({ where: live({ status: { [Op.in]: ['Pending', 'Checked-In'] } }) }),
    StockTransfer.count({ where: live({ status: { [Op.in]: ['Dispatched', 'InTransit'] } }) }),
  ]);

  return {
    key: 'pickToShip',
    title: 'Pick to Ship',
    summary: 'Everything between an order reaching the floor and the goods clearing the gate.',
    stages: [
      stage('pickWaves', 'Waves on the floor', '/waves', waves, 'Planned, released or being picked'),
      stage('warehouseOps', 'Tasks outstanding', '/warehouse-floor', tasks, 'Assigned or in progress'),
      stage('exceptions', 'Exceptions open', '/warehouse-floor', exceptions, 'Short picks, damage, wrong bin'),
      stage('shipments', 'Awaiting despatch', '/shipments', shipments, 'Packed, not yet gone'),
      stage('gatepasses', 'At the gate', '/gatepasses', atGate, 'Vehicle in, not checked out'),
      stage('stockTransfers', 'Goods in transit', '/stock-transfers', inTransit, 'Left one location, not arrived'),
    ],
  };
}

/**
 * Counting, correcting, and checking the correction held.
 *
 * The last stage is what makes the chain worth drawing at all. An adjustment
 * that was approved is not the same thing as a discrepancy that went away, and
 * a process which stops at "approved" is how a location gets corrected every
 * month and drifts anyway.
 */
async function countToCorrect(req) {
  const [counting, countApproval, drafted, adjustApproval] = await Promise.all([
    StockCount.count({ where: scoped(req, live({ status: { [Op.in]: ['Draft', 'Counting'] } })) }),
    StockCount.count({ where: scoped(req, live({ status: 'Pending' })) }),
    StockAdjustment.count({ where: scoped(req, live({ status: 'Draft' })) }),
    StockAdjustment.count({ where: scoped(req, live({ status: 'Pending' })) }),
  ]);

  return {
    key: 'countToCorrect',
    title: 'Count to Correct',
    summary: 'Counting the shelf, correcting what disagrees, and checking afterwards that it now agrees.',
    stages: [
      stage('stockCounts', 'Counts in progress', '/stock-counts', counting, 'Sheets open on the floor'),
      stage('countApproval', 'Counts to approve', '/stock-counts', countApproval, 'Counted, variance not accepted'),
      stage('stockAdjustments', 'Corrections drafted', '/stock-adjustments', drafted, 'Written up, not submitted'),
      stage('adjustApproval', 'Corrections to approve', '/stock-adjustments', adjustApproval, 'Awaiting a decision'),
    ],
  };
}

/**
 * The books, from a spend being written down to a statement worth reading.
 *
 * "Tills still open" counts registers opened and never closed. On the day that
 * is not an error; a week later it is, because a float nobody counted out is a
 * difference nobody can reconstruct.
 */
async function recordToReport(req) {
  const [expenses, tills, drafts, approvals] = await Promise.all([
    Expense.count({ where: scoped(req, live({ status: { [Op.in]: ['Draft', 'Pending Approval'] } })) }),
    CashRegister.count({ where: scoped(req, live({ status: 'Open' })) }),
    JournalEntry.count({ where: scoped(req, live({ status: 'Draft' })) }),
    // Not scoped: an approval belongs to the document that raised it, and the
    // request itself carries no location.
    ApprovalRequest.count({ where: live({ status: 'Pending' }) }),
  ]);

  return {
    key: 'recordToReport',
    title: 'Record to Report',
    summary: 'From a spend being recorded to a statement that can be trusted.',
    stages: [
      stage('expenses', 'Expenses to approve', '/expenses', expenses, 'Draft or awaiting sign-off'),
      stage('cashRegisters', 'Tills still open', '/cash-registers', tills, 'Opened and never closed out'),
      stage('journalEntries', 'Vouchers unposted', '/journal-entries', drafts, 'Written up, not in the ledger'),
      stage('approvals', 'Awaiting approval', '/approvals', approvals, 'Documents held for a decision'),
    ],
  };
}

/**
 * The hardware on the floor, and whether it is still telling the truth.
 *
 * Every stage here counts something that should normally be zero. That is the
 * point: a connected floor is only worth having while the connections are
 * live, and the failure that matters is silence — a probe that stopped
 * reporting reads exactly like a room that is behaving.
 */
async function connectedFloor(req) {
  const silentBefore = new Date(Date.now() - 15 * 60_000);

  const [silentDevices, openBreaches, unmonitored, staleTags] = await Promise.all([
    Device.count({ where: scoped(req, live({
      status: 'ACTIVE',
      [Op.or]: [{ lastSeenAt: null }, { lastSeenAt: { [Op.lt]: silentBefore } }],
    })) }),
    WarehouseException.count({ where: scoped(req, live({
      exceptionType: 'ENVIRONMENT_BREACH',
      status: { [Op.in]: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
    })) }),
    // Places with limits set but nothing ever received for them.
    SensorThreshold.count({ where: scoped(req, live({ isActive: true })) }),
    RfidTag.count({ where: scoped(req, live({ status: 'ASSIGNED', lastSeenAt: null })) }),
  ]);

  const readings = await SensorReading.count({ where: scoped(req, {}) });

  return {
    key: 'connectedFloor',
    title: 'Connected Floor',
    summary: 'Scanners, sensors and readers — and whether any of them have gone quiet.',
    stages: [
      stage('devices', 'Devices gone quiet', '/devices', silentDevices, 'Nothing heard for 15 minutes'),
      stage('sensors', 'Excursions open', '/sensors', openBreaches, 'A place outside its safe range'),
      stage('sensorCoverage', 'Places monitored', '/sensors', unmonitored, readings ? 'Thresholds in force' : 'No readings received yet'),
      stage('rfidTags', 'Tags never seen', '/rfid-tags', staleTags, 'Assigned but never swept'),
    ],
  };
}

const BUILDERS = {
  orderToCash,
  procureToStock,
  issueToReturn,
  planToReplenish,
  pickToShip,
  countToCorrect,
  recordToReport,
  connectedFloor,
};

/** True when this key names a process the overview can build. */
const isProcess = (key) => Object.hasOwn(BUILDERS, key);

export async function processOverview(key, req) {
  const build = BUILDERS[key];
  if (!build) {
    throw Object.assign(new Error(`No such process: ${key}`), { status: 404 });
  }
  return build(req);
}
