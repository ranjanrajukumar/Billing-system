import { Invoice, SalesOrder, SalesOrderItem, Product, StockMovement } from '../../models/index.js';

/**
 * The seam between billing and the warehouse.
 *
 * Three systems have an opinion about the same goods. The sales order commits
 * them, the warehouse moves them, and the invoice charges for them — and each
 * one, left to itself, would happily deduct the same box of stock. This module
 * is the single place that decides which of them is the one to move it, so the
 * governing rule survives contact with a second code path:
 *
 *   Stock leaves the location exactly once.
 *
 * Where in the cycle that "once" happens depends on how far the warehouse has
 * got with the order by the time somebody raises the bill:
 *
 *   order not confirmed      → the invoice is the stock event (a counter sale
 *                              that happens to quote an order number)
 *   confirmed, not dispatched → the order holds a reservation; the invoice
 *                              consumes it, dropping stock and the hold together
 *   dispatched or beyond      → the goods already left at dispatch; the invoice
 *                              is a financial document and must not touch stock
 *
 * The third case is the one worth stating out loud, because it looks wrong: an
 * invoice that does not reduce stock. It is correct precisely because dispatch
 * already did, and billing a shipped order a second time would take the same
 * goods out of the building twice — a discrepancy nobody finds until a count.
 */

// Fulfilment states in which the goods are physically out of the building.
// Taken from SalesOrder.fulfilmentStatus, which is kept apart from the
// commercial `status` on purpose: where the goods are and whether the order is
// agreed are different questions.
export const DISPATCHED_STATES = ['Dispatched', 'InTransit', 'Delivered'];

/** True once the warehouse has sent the goods out. */
export function stockHasLeft(order) {
  return DISPATCHED_STATES.includes(order?.fulfilmentStatus);
}

/**
 * Live invoices already raised against an order.
 *
 * Cancelled and soft-deleted bills are excluded, so an invoice raised in error
 * can be cancelled and the order billed again — cancellation already put the
 * stock back, so the second bill starts from the same position as the first.
 */
export async function invoicesFor(salesOrderId, { transaction = null, excludeInvoiceId = null } = {}) {
  const invoices = await Invoice.findAll({
    where: { salesOrderId, detstatus: false },
    attributes: ['id', 'invoiceNumber', 'status', 'grandTotal', 'invoiceDate'],
    transaction,
  });
  return invoices.filter((invoice) => (
    invoice.status !== 'Cancelled' && Number(invoice.id) !== Number(excludeInvoiceId)
  ));
}

/**
 * Did this invoice actually move stock?
 *
 * Asked of the ledger rather than of a column on the invoice, because the
 * ledger is the authority on what moved and a flag is a second copy of the
 * truth that can disagree with it. Cancelling or editing a bill needs this
 * answer: an invoice raised against an already-dispatched order never deducted
 * anything, so unwinding it must not put stock back that it never took.
 */
export async function invoiceMovedStock(invoiceId, { transaction = null } = {}) {
  const count = await StockMovement.count({
    where: { referenceType: 'Invoice', referenceId: invoiceId },
    transaction,
  });
  return count > 0;
}

/**
 * Works out what billing is allowed to do about an order's stock.
 *
 * Returns the order alongside three flags the invoice paths act on. Both
 * `createInvoice` and `confirmInvoice` come through here so the two cannot
 * drift into disagreeing about the same order.
 */
export async function resolveOrderLink(salesOrderId, { transaction = null, excludeInvoiceId = null } = {}) {
  // Take the order's row first, on its own, before reading anything off it.
  //
  // Two tills billing the same order would otherwise both find it unbilled,
  // both pass the check below, and both deduct — the same failure mode as two
  // counters selling the last unit, which the rest of the system is careful
  // about. The lock is a separate scalar read rather than a clause on the
  // query below because that one joins the lines and their products, and
  // locking through an outer join is both far wider than needed and not
  // portable.
  if (transaction) {
    await SalesOrder.findOne({
      where: { id: salesOrderId },
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  const order = await SalesOrder.findOne({
    where: { id: salesOrderId, detstatus: false },
    include: [{ model: SalesOrderItem, include: [{ model: Product }] }],
    transaction,
  });
  if (!order) {
    throw Object.assign(new Error(`Sales order ${salesOrderId} not found`), { status: 404 });
  }
  if (order.status === 'Cancelled') {
    throw Object.assign(
      new Error(`Sales order ${order.orderNumber} is cancelled and cannot be invoiced`),
      { status: 409 },
    );
  }

  const stockLeftAtDispatch = stockHasLeft(order);
  // `confirm` on a sales order is what reserves the stock, and it records that
  // by setting the commercial status to Approved. Once the goods have gone out
  // the reservation went with them, so there is nothing left to consume.
  const hasReservation = order.status === 'Approved' && !stockLeftAtDispatch;

  const alreadyBilled = await invoicesFor(order.id, { transaction, excludeInvoiceId });

  return {
    order,
    /** The goods are out of the building; the bill is financial only. */
    stockLeftAtDispatch,
    /** The order is holding a reservation this bill should consume. */
    hasReservation,
    /** Whether raising this bill is the event that takes stock out. */
    movesStock: !stockLeftAtDispatch,
    alreadyBilled,
  };
}

/**
 * Refuses a second live bill against the same order.
 *
 * Part-billing an order is a real thing to want, and the schema allows it — an
 * order has many invoices. It is refused here anyway because the quantity a
 * second bill should cover has nowhere to come from yet: the reservation the
 * first bill consumed is gone, so a second one would deduct stock again with
 * no availability check behind it. Refusing is the recoverable half of that
 * choice; silently double-deducting is not.
 */
export function assertNotAlreadyBilled(link) {
  if (!link.alreadyBilled.length) return;
  const numbers = link.alreadyBilled.map((invoice) => invoice.invoiceNumber).join(', ');
  throw Object.assign(
    new Error(
      `Sales order ${link.order.orderNumber} is already invoiced (${numbers}). `
      + 'Cancel that invoice first if it needs to be raised again.',
    ),
    { status: 409 },
  );
}

/**
 * Turns an order's lines into the invoice payload the billing screen posts.
 *
 * Quantity is what is actually being billed, which is not always what was
 * ordered: once the warehouse has dispatched, the bill follows the goods that
 * went, not the goods that were promised. A short shipment therefore bills
 * short, rather than charging for a box the customer never received.
 */
export function invoiceLinesFor(link) {
  const { order, stockLeftAtDispatch } = link;

  return (order.SalesOrderItems || [])
    .map((item) => {
      const ordered = Number(item.quantity || 0);
      const dispatched = Number(item.dispatchedQty || 0);
      const quantity = stockLeftAtDispatch ? dispatched : ordered;
      return {
        productId: item.productId,
        quantity,
        rate: Number(item.unitPrice || 0),
        discount: Number(item.discount || 0),
        gstPercent: Number(item.gstPercent || 0),
        um: item.Product?.primaryUnit || null,
      };
    })
    .filter((line) => line.quantity > 0);
}
