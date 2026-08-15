import { Op } from 'sequelize';
import {
  ApprovalRequest, CashRegister, Grn, Invoice, Payment, Product, ProductBatch,
  Purchase, PurchaseOrder, SalesOrder, StockTransfer,
} from '../models/index.js';
import { getConfig } from './config.service.js';
import { reconcileStock } from './stockAudit.service.js';

/**
 * The alert feed behind the bell.
 *
 * Every alert has to answer three questions: what is wrong, how many, and
 * where do I go to deal with it. An alert without a destination is just
 * anxiety, so each one carries the route that resolves it.
 *
 * Alerts are computed on demand rather than stored. A stored notification has
 * to be invalidated when the underlying situation is fixed, and the one thing
 * worse than no alert is an alert about something already dealt with.
 *
 * Each alert declares the module it belongs to and is dropped when that module
 * is off — a Basic-mode shop is never told about an unposted GRN.
 */

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

/** Kept in step with `expiringBatches`, so the bell and the report agree. */
const EXPIRY_WARNING_DAYS = 60;

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const isoDay = (date) => date.toISOString().slice(0, 10);

/**
 * Builds the alert list for one user.
 *
 * `branchId` scopes location-specific alerts; `role` decides which approvals
 * are theirs to act on. Anything that throws is skipped rather than taking the
 * whole feed down — a bell that fails closed tells the user nothing at all.
 */
export async function buildAlerts({ branchId = null, role = null, menus = [] } = {}) {
  const { modules } = await getConfig();
  const alerts = [];

  const visible = (menu) => !menus.length || menus.includes(menu);

  /** Adds an alert, unless its module is off or the user cannot open its page. */
  const add = (alert) => {
    if (alert.module && !modules.has(alert.module)) return;
    if (alert.menu && !visible(alert.menu)) return;
    if (!alert.count) return;
    alerts.push(alert);
  };

  const safely = async (label, work) => {
    try { await work(); } catch (error) {
      console.warn(`Alert "${label}" skipped: ${error.message}`);
    }
  };

  // ---- Stock ----
  await safely('stock levels', async () => {
    const products = await Product.findAll({
      where: { detstatus: false, isActive: true },
      attributes: ['id', 'productName', 'stock', 'lowStockThreshold', 'reorderLevel'],
      raw: true,
    });

    const out = products.filter((p) => Number(p.stock) <= 0);
    // Reorder level is the buying trigger where set; the threshold is the fallback.
    const low = products.filter((p) => {
      const level = Number(p.reorderLevel ?? p.lowStockThreshold ?? 0);
      return Number(p.stock) > 0 && Number(p.stock) <= level;
    });

    add({
      key: 'stock-out', severity: 'critical', category: 'Stock',
      title: 'Out of stock',
      detail: out.length === 1
        ? `${out[0].productName} has none left`
        : `${out.length} products have none left`,
      count: out.length, link: '/inventory', menu: 'inventory',
    });

    add({
      key: 'stock-low', severity: 'warning', category: 'Stock',
      title: 'Running low',
      detail: low.length === 1
        ? `${low[0].productName} is at or below its reorder level`
        : `${low.length} products are at or below their reorder level`,
      count: low.length, link: '/inventory', menu: 'inventory',
    });
  });

  // ---- Lots ----
  await safely('expiring lots', async () => {
    const today = isoDay(new Date());
    // 60 days, matching the expiry report's own default. Seed and agri stock
    // needs a season's notice to be sold through or sent back — a fortnight's
    // warning arrives far too late to do anything with.
    const soon = isoDay(new Date(Date.now() + EXPIRY_WARNING_DAYS * 86400000));

    const where = { detstatus: false, quantity: { [Op.gt]: 0 }, expiryDate: { [Op.ne]: null } };
    if (branchId) where.branchId = branchId;

    const [expired, expiring] = await Promise.all([
      ProductBatch.count({ where: { ...where, expiryDate: { [Op.lt]: today } } }),
      ProductBatch.count({ where: { ...where, expiryDate: { [Op.between]: [today, soon] } } }),
    ]);

    add({
      key: 'lots-expired', severity: 'critical', category: 'Stock',
      title: 'Expired stock still on the shelf',
      detail: `${expired} lot${expired === 1 ? '' : 's'} past their expiry date and still holding stock`,
      count: expired, link: '/batches', module: 'batches', menu: 'batches',
    });

    add({
      key: 'lots-expiring', severity: 'warning', category: 'Stock',
      title: `Expiring within ${EXPIRY_WARNING_DAYS} days`,
      detail: `${expiring} lot${expiring === 1 ? '' : 's'} to sell or return before they expire`,
      count: expiring, link: '/batches', module: 'batches', menu: 'batches',
    });
  });

  // ---- Money owed to us ----
  await safely('overdue receivables', async () => {
    const overdue = await Invoice.findAll({
      where: {
        detstatus: false,
        status: { [Op.in]: ['Unpaid', 'Partially Paid'] },
        dueDate: { [Op.ne]: null, [Op.lt]: isoDay(new Date()) },
        ...(branchId ? { branchId } : {}),
      },
      include: [{ model: Payment, where: { detstatus: false }, required: false, attributes: ['amount'] }],
    });

    const owed = overdue.reduce((sum, invoice) => {
      const paid = (invoice.Payments || []).reduce((s, p) => s + Number(p.amount), 0);
      return sum + (Number(invoice.grandTotal) - paid);
    }, 0);

    add({
      key: 'receivables-overdue', severity: 'warning', category: 'Money',
      title: 'Overdue customer payments',
      detail: `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} past their due date — ₹${Math.round(owed).toLocaleString('en-IN')} outstanding`,
      count: overdue.length, link: '/ledgers', menu: 'ledgers',
    });
  });

  // ---- Money we owe ----
  await safely('unpaid supplier bills', async () => {
    const unpaid = await Purchase.count({
      where: {
        detstatus: false,
        status: { [Op.ne]: 'Cancelled' },
        paymentStatus: { [Op.in]: ['Unpaid', 'Partially Paid'] },
        ...(branchId ? { branchId } : {}),
      },
    });

    add({
      key: 'payables-open', severity: 'info', category: 'Money',
      title: 'Supplier bills to settle',
      detail: `${unpaid} purchase${unpaid === 1 ? '' : 's'} not fully paid`,
      count: unpaid, link: '/ledgers', menu: 'ledgers',
    });
  });

  // ---- Approvals waiting on this person ----
  await safely('pending approvals', async () => {
    const where = { status: 'Pending', detstatus: false };
    // Admins can decide anything; everyone else only sees their own queue.
    if (role && role !== 'Admin') where.approverRole = role;

    const pending = await ApprovalRequest.count({ where });

    add({
      key: 'approvals-pending', severity: 'warning', category: 'Approvals',
      title: 'Waiting for your approval',
      detail: `${pending} document${pending === 1 ? '' : 's'} blocked until signed off`,
      count: pending, link: '/approvals', module: 'approvals', menu: 'approvals',
    });
  });

  // ---- Transfers ----
  await safely('transfers in transit', async () => {
    const where = {
      detstatus: false,
      status: { [Op.in]: ['InTransit', 'Dispatched', 'PartiallyReceived'] },
    };
    if (branchId) where.toBranchId = branchId;

    const inTransit = await StockTransfer.count({ where });

    add({
      key: 'transfers-in-transit', severity: 'warning', category: 'Stock',
      title: 'Stock waiting to be received',
      detail: `${inTransit} transfer${inTransit === 1 ? ' has' : 's have'} been dispatched but not received — that stock cannot be sold yet`,
      count: inTransit, link: '/stock-transfers', module: 'stockTransfers', menu: 'stockTransfers',
    });
  });

  // ---- Fulfilment ----
  await safely('orders waiting on the warehouse', async () => {
    // Orders somebody has started and left. Allocation and picking hold stock
    // back from every other order without moving it anywhere, so an order
    // abandoned halfway quietly makes goods unsellable — the shelf still shows
    // them, but nothing else may promise them.
    const stalled = await SalesOrder.count({
      where: {
        detstatus: false,
        // ReadyToShip is deliberately absent: it is finished warehouse work
        // waiting on a van, and it has its own alert. Counting it here too
        // would report the same order twice under two different meanings.
        fulfilmentStatus: { [Op.in]: ['Allocated', 'Picking', 'Picked', 'Packed'] },
        ...(branchId ? { fulfilFromBranchId: branchId } : {}),
      },
    });

    add({
      key: 'orders-in-fulfilment', severity: 'warning', category: 'Stock',
      title: 'Orders part-way through the warehouse',
      detail: `${stalled} order${stalled === 1 ? ' is' : 's are'} allocated or picked but not dispatched — that stock is held back from every other order`,
      count: stalled, link: '/warehouse-floor', module: 'warehouses', menu: 'warehouseOps',
    });
  });

  await safely('orders ready to dispatch', async () => {
    const ready = await SalesOrder.count({
      where: {
        detstatus: false,
        fulfilmentStatus: 'ReadyToShip',
        ...(branchId ? { fulfilFromBranchId: branchId } : {}),
      },
    });

    add({
      key: 'orders-ready-to-ship', severity: 'info', category: 'Stock',
      title: 'Packed and waiting for the van',
      detail: `${ready} order${ready === 1 ? ' is' : 's are'} boxed and ready to go`,
      count: ready, link: '/warehouse-floor', module: 'warehouses', menu: 'warehouseOps',
    });
  });

  // ---- Purchasing ----
  await safely('overdue purchase orders', async () => {
    const overdue = await PurchaseOrder.count({
      where: {
        detstatus: false,
        status: { [Op.in]: ['Approved', 'Partially Received'] },
        expectedDate: { [Op.ne]: null, [Op.lt]: isoDay(new Date()) },
        ...(branchId ? { branchId } : {}),
      },
    });

    add({
      key: 'po-overdue', severity: 'warning', category: 'Purchasing',
      title: 'Deliveries past their date',
      detail: `${overdue} purchase order${overdue === 1 ? '' : 's'} due before today and still not fully received`,
      count: overdue, link: '/purchase-orders', module: 'purchaseOrders', menu: 'purchaseOrders',
    });
  });

  await safely('unposted receipts', async () => {
    const unposted = await Grn.count({
      where: {
        detstatus: false,
        postedAt: null,
        status: { [Op.ne]: 'Cancelled' },
        ...(branchId ? { branchId } : {}),
      },
    });

    add({
      key: 'grn-unposted', severity: 'warning', category: 'Purchasing',
      title: 'Goods received but not in stock',
      detail: `${unposted} receipt${unposted === 1 ? '' : 's'} saved but never posted — the stock is on the floor and not in the system`,
      count: unposted, link: '/grn', module: 'purchaseOrders', menu: 'grn',
    });
  });

  // ---- Cash ----
  await safely('registers left open', async () => {
    const where = { detstatus: false, status: 'Open', openedAt: { [Op.lt]: daysAgo(1) } };
    if (branchId) where.branchId = branchId;

    const stale = await CashRegister.count({ where });

    add({
      key: 'register-open', severity: 'warning', category: 'Money',
      title: 'Till still open from a previous day',
      detail: `${stale} cash register${stale === 1 ? '' : 's'} never closed — the day's cash has not been counted`,
      count: stale, link: '/cash-registers', module: 'cashBank', menu: 'cashRegisters',
    });
  });

  // ---- Integrity ----
  await safely('stock reconciliation', async () => {
    const { mismatched, driftValue } = await reconcileStock({ branchId });

    add({
      key: 'stock-drift', severity: 'critical', category: 'Stock',
      title: 'Stock figures do not match the ledger',
      detail: `${mismatched} balance${mismatched === 1 ? '' : 's'} disagree with the movement history — ₹${Math.round(driftValue).toLocaleString('en-IN')} at cost`,
      count: mismatched, link: '/stock-audit', module: 'stockAudit', menu: 'stockAudit',
    });
  });

  return alerts.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return bySeverity !== 0 ? bySeverity : b.count - a.count;
  });
}

/** Alert counts by severity, for the badge on the bell. */
export function summarise(alerts) {
  const counts = { critical: 0, warning: 0, info: 0, total: alerts.length };
  for (const alert of alerts) counts[alert.severity] += 1;
  return counts;
}
