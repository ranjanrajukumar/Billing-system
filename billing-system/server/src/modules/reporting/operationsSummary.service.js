import { Op, col, literal } from 'sequelize';
import {
  ApprovalRequest, Grn, Invoice, Payment, Product, ProductBatch,
  PurchaseOrder, SalesOrder, SalesReturn, StockAdjustment, StockIssue,
  StockIssueReturn,
} from '../../models/index.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { live } from '../../utils/query.js';
import { DISPATCHED_STATES } from '../sales/salesOrderLink.service.js';

/**
 * The operations summary the dashboard is built from.
 *
 * Three bands, and each answers a different question, which is the reason they
 * are not one list of numbers:
 *
 *   TODAY             what has happened since this morning, against yesterday
 *   PENDING & AGEING  what is waiting, and how long it has been waiting
 *   BY AREA           where each part of the business stands right now
 *
 * The middle band is the one worth having. A queue length on its own says
 * nothing — thirty-eight unbilled orders is a normal Tuesday if they arrived an
 * hour ago and a serious problem if they have been sitting a week. Splitting
 * every pending figure by age is what turns a number into a decision, and it is
 * why these cannot simply be the counts the process pages already produce.
 */

/** Midnight this morning and midnight yesterday, as the DATEONLY columns store them. */
function days() {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return { today: iso(now), yesterday: iso(yesterday) };
}

/** The moment 24 hours ago, which is what "ageing" is measured against. */
const dayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

/**
 * A figure for today, next to the same figure for yesterday.
 *
 * The delta is null rather than zero when yesterday was zero. A rise from
 * nothing to something is not "+100%" or "+0%" — it is a change with no
 * meaningful percentage, and printing one invites somebody to read a trend into
 * the first sale of a quiet week.
 */
function withDelta(value, previous) {
  const current = Number(value || 0);
  const before = Number(previous || 0);
  return {
    value: current,
    previous: before,
    deltaPct: before === 0 ? null : Math.round(((current - before) / before) * 100),
  };
}

/**
 * A pending count split by how long it has been pending.
 *
 * `overdue` is the half that matters; `recent` is there so the total is visible
 * and nobody has to wonder whether the queue is small or merely young.
 */
async function ageing(model, where, { transaction = null } = {}) {
  const cutoff = dayAgo();
  const [recent, overdue] = await Promise.all([
    model.count({ where: { ...where, addondt: { [Op.gte]: cutoff } }, transaction }),
    model.count({ where: { ...where, addondt: { [Op.lt]: cutoff } }, transaction }),
  ]);
  return { recent, overdue, total: recent + overdue };
}

/**
 * Dispatched orders nobody has billed, by age.
 *
 * The figure the sales-order-to-invoice link made answerable at all. Ageing it
 * is the point: revenue that left on a van this morning is in hand, and revenue
 * that left a fortnight ago is a conversation with a customer who has already
 * had the goods.
 */
async function unbilledDispatched(req) {
  const where = scopedWhere(req, live({
    fulfilmentStatus: { [Op.in]: DISPATCHED_STATES },
    id: {
      [Op.notIn]: literal(
        '(SELECT sales_order_id FROM invoices '
        + "WHERE sales_order_id IS NOT NULL AND detstatus = 0 AND status <> 'Cancelled')",
      ),
    },
  }));

  const cutoff = dayAgo();
  const [recent, overdue] = await Promise.all([
    SalesOrder.count({ where: { ...where, dispatchedAt: { [Op.gte]: cutoff } } }),
    SalesOrder.count({ where: { ...where, dispatchedAt: { [Op.lt]: cutoff } } }),
  ]);
  return { recent, overdue, total: recent + overdue };
}

async function todayBand(req) {
  const { today, yesterday } = days();
  // Every figure in this band is scoped the same way; naming it once keeps the
  // twelve queries below readable as six pairs rather than twelve statements.
  const on = (extra = {}) => scopedWhere(req, live(extra));

  const [
    invoicesToday, invoicesYesterday,
    salesToday, salesYesterday,
    paidToday, paidYesterday,
    receiptsToday, receiptsYesterday,
    issuedToday, issuedYesterday,
    dispatchedToday, dispatchedYesterday,
  ] = await Promise.all([
    Invoice.count({ where: on({ invoiceDate: today }) }),
    Invoice.count({ where: on({ invoiceDate: yesterday }) }),
    Invoice.sum('grandTotal', { where: on({ invoiceDate: today }) }),
    Invoice.sum('grandTotal', { where: on({ invoiceDate: yesterday }) }),
    Payment.sum('amount', { where: live({ paidAt: { [Op.gte]: `${today} 00:00:00` } }) }),
    Payment.sum('amount', {
      where: live({ paidAt: { [Op.gte]: `${yesterday} 00:00:00`, [Op.lt]: `${today} 00:00:00` } }),
    }),
    Grn.count({ where: on({ grnDate: today }) }),
    Grn.count({ where: on({ grnDate: yesterday }) }),
    StockIssue.count({ where: on({ issueDate: today, status: { [Op.ne]: 'Draft' } }) }),
    StockIssue.count({ where: on({ issueDate: yesterday, status: { [Op.ne]: 'Draft' } }) }),
    SalesOrder.count({ where: on({ dispatchedAt: { [Op.gte]: `${today} 00:00:00` } }) }),
    SalesOrder.count({
      where: on({ dispatchedAt: { [Op.gte]: `${yesterday} 00:00:00`, [Op.lt]: `${today} 00:00:00` } }),
    }),
  ]);

  return [
    { key: 'invoices', label: 'Invoices Raised', path: '/invoices', ...withDelta(invoicesToday, invoicesYesterday) },
    { key: 'sales', label: 'Sales Value', path: '/invoices', money: true, ...withDelta(salesToday, salesYesterday) },
    { key: 'payments', label: 'Payments Received', path: '/ledgers', money: true, ...withDelta(paidToday, paidYesterday) },
    { key: 'receipts', label: 'Goods Received', path: '/grn', ...withDelta(receiptsToday, receiptsYesterday) },
    { key: 'issues', label: 'Material Issued', path: '/stock-issues', ...withDelta(issuedToday, issuedYesterday) },
    { key: 'dispatched', label: 'Orders Dispatched', path: '/sales-orders', ...withDelta(dispatchedToday, dispatchedYesterday) },
  ];
}

async function pendingBand(req) {
  const [unbilled, draftInvoices, receipts, issues, returns, approvals] = await Promise.all([
    unbilledDispatched(req),
    ageing(Invoice, scopedWhere(req, live({ status: 'Draft' }))),
    ageing(Grn, scopedWhere(req, live({ status: 'Draft' }))),
    ageing(StockIssue, scopedWhere(req, live({ status: 'Draft' }))),
    ageing(StockIssueReturn, scopedWhere(req, live({ status: 'Draft' }))),
    ageing(ApprovalRequest, live({ status: 'Pending' })),
  ]);

  return [
    { key: 'unbilled', label: 'Dispatched, Not Billed', path: '/sales-orders', ...unbilled },
    { key: 'draftInvoices', label: 'Invoices Unconfirmed', path: '/invoices', ...draftInvoices },
    { key: 'receipts', label: 'Receipts To Post', path: '/grn', ...receipts },
    { key: 'issues', label: 'Issues To Release', path: '/stock-issues', ...issues },
    { key: 'returns', label: 'Returns To Post', path: '/stock-issue-returns', ...returns },
    { key: 'approvals', label: 'Awaiting Approval', path: '/approvals', ...approvals },
  ];
}

/** A label-and-figure row, the shape the three panels are built from. */
const row = (label, value, { path = null, tone = null, hint = null } = {}) => ({
  label, value, path, tone, hint,
});

async function areaBands(req) {
  const { today } = days();
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);

  const [
    ordersDue, ordersInFulfilment, unpaid, salesReturns,
    skus, belowReorder, expiring, stillOut,
    posApproval, posAwaiting, qcAndBills, adjustments,
  ] = await Promise.all([
    SalesOrder.count({ where: scopedWhere(req, live({ status: 'Approved', fulfilmentStatus: 'Pending' })) }),
    SalesOrder.count({
      where: scopedWhere(req, live({
        fulfilmentStatus: { [Op.in]: ['Allocated', 'Picking', 'Picked', 'Packed', 'ReadyToShip'] },
      })),
    }),
    Invoice.count({ where: scopedWhere(req, live({ status: { [Op.in]: ['Unpaid', 'Partially Paid'] } })) }),
    SalesReturn.count({ where: scopedWhere(req, live({ status: 'Pending' })) }),

    Product.count({ where: live() }),
    Product.count({ where: live({ stock: { [Op.lte]: col('low_stock_threshold') } }) }),
    ProductBatch.count({
      where: scopedWhere(req, live({
        quantity: { [Op.gt]: 0 },
        expiryDate: { [Op.ne]: null, [Op.lte]: soon.toISOString().slice(0, 10) },
      })),
    }),
    StockIssue.count({ where: scopedWhere(req, live({ status: 'Issued', returnable: true })) }),

    PurchaseOrder.count({ where: scopedWhere(req, live({ status: { [Op.in]: ['Draft', 'Pending Approval'] } })) }),
    PurchaseOrder.count({ where: scopedWhere(req, live({ status: { [Op.in]: ['Approved', 'Partially Received'] } })) }),
    Grn.count({ where: scopedWhere(req, live({ status: 'Pending QC' })) }),
    StockAdjustment.count({ where: scopedWhere(req, live({ status: 'Pending' })) }),
  ]);

  return {
    sales: {
      title: 'Sales',
      rows: [
        row('Orders awaiting allocation', ordersDue, { path: '/sales-orders' }),
        row('Orders in fulfilment', ordersInFulfilment, { path: '/sales-orders' }),
        row('Invoices awaiting payment', unpaid, { path: '/invoices', tone: unpaid > 0 ? 'warning' : null }),
        row('Returns to process', salesReturns, { path: '/sales-returns' }),
      ],
    },
    inventory: {
      title: 'Inventory',
      rows: [
        row('Total SKUs', skus, { path: '/products' }),
        row('Below reorder level', belowReorder, { path: '/inventory', tone: belowReorder > 0 ? 'warning' : null }),
        row('Lots expiring in 30 days', expiring, { path: '/batches', tone: expiring > 0 ? 'error' : null }),
        row('Material still out', stillOut, { path: '/stock-issues' }),
      ],
    },
    purchasing: {
      title: 'Purchasing',
      rows: [
        row('Orders awaiting approval', posApproval, { path: '/purchase-orders' }),
        row('Orders awaiting delivery', posAwaiting, { path: '/purchase-orders' }),
        row('Receipts held for QC', qcAndBills, { path: '/qc' }),
        row('Corrections to approve', adjustments, { path: '/stock-adjustments' }),
      ],
    },
  };
}

export async function operationsSummary(req) {
  const [today, pending, areas] = await Promise.all([
    todayBand(req),
    pendingBand(req),
    areaBands(req),
  ]);
  return { today, pending, areas, asOf: new Date().toISOString() };
}
