import { Op } from 'sequelize';
import {
  StockIssue, StockIssueItem, StockIssueReturn, StockIssueReturnItem, Product,
} from '../../models/index.js';

/**
 * Issuing material out of the store, and getting the unused part back.
 *
 * The rule the whole document pair exists to keep true:
 *
 *   Nothing comes back that did not go out.
 *
 * It sounds too obvious to need enforcing, and it is the one thing a returns
 * screen breaks first. A return is an *inbound* stock movement raised by
 * whoever is standing at the counter, so with no ceiling on it the store can be
 * credited with material it never issued — and because the quantity is real and
 * the paperwork is complete, nothing about the resulting figure looks wrong.
 * Every guard below is a version of that ceiling.
 *
 * The other rule is quieter and belongs here rather than in the controller,
 * because both documents need it and each would otherwise decide for itself:
 *
 *   Only good material returns to stock.
 *
 * Damaged goods coming back close the outstanding quantity and stop there. They
 * left at issue and they are not stock any more; putting them back so that a
 * write-off can immediately take them out again would leave two movements
 * describing one event, and a shelf figure that was briefly, on paper, wrong.
 */

/** Rounds to the precision the quantity columns hold, so 0.1 + 0.2 cannot leave a residue. */
const qty = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

/**
 * How much of an issue line is still out.
 *
 * Returned, scrapped and closed off all count against it. The distinctions
 * between the three matter to the books and to the store, but not to this
 * figure: either way the line is settled and nobody is waiting for it.
 */
export function outstandingOn(item) {
  return qty(
    qty(item.quantity) - qty(item.returnedQty) - qty(item.scrappedQty) - qty(item.closedQty),
  );
}

/** The issue's own progress, derived from its lines. */
export function progressOf(items = []) {
  const sum = (field) => items.reduce((total, item) => total + qty(item[field]), 0);
  const issued = sum('quantity');
  const returned = sum('returnedQty');
  const scrapped = sum('scrappedQty');
  const consumed = sum('closedQty');
  return {
    issued,
    /** Came back fit to use. */
    returned,
    /** Came back damaged, on a return note. */
    scrapped,
    /** Never came back; written off when the voucher was closed. */
    consumed,
    outstanding: qty(issued - returned - scrapped - consumed),
  };
}

/**
 * Where the issue has got to, worked out from its lines rather than set by hand.
 *
 * Draft and Cancelled are facts about the document and are left alone. Issued
 * and Closed are facts about the material, and those the lines can answer.
 * A non-returnable issue is Closed the moment it is posted: nothing is expected
 * back, so leaving it Issued would park consumables on the outstanding report
 * for ever and train everybody to ignore it.
 */
export function deriveIssueStatus(issue, items) {
  if (issue.status === 'Draft' || issue.status === 'Cancelled') return issue.status;
  if (!issue.returnable) return 'Closed';
  return progressOf(items).outstanding > 0 ? 'Issued' : 'Closed';
}

/**
 * Loads an issue for a write, with its row locked.
 *
 * Two people returning against the same voucher at the same moment is the
 * ordinary case in a store with a counter and a phone, and both would otherwise
 * read the same outstanding figure and both be allowed to return against it.
 * The lock is on the issue rather than on each line because a return is one
 * decision about one voucher.
 */
export async function loadIssueForUpdate(id, transaction) {
  const issue = await StockIssue.findOne({
    where: { id, detstatus: false },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!issue) throw Object.assign(new Error('Store issue not found'), { status: 404 });

  // Loaded separately from the lock above: locking through the join to the
  // lines and their products would take far more of the database than this
  // needs, and not portably.
  issue.StockIssueItems = await StockIssueItem.findAll({
    where: { issueId: issue.id, detstatus: false },
    include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'purchasePrice'] }],
    transaction,
  });
  return issue;
}

/** At least one of the four recipient fields has to say who has the goods. */
export function assertHasRecipient(body) {
  const named = [body.departmentId, body.issuedToUserId, body.issuedToName, body.jobNumber]
    .some((value) => value !== undefined && value !== null && String(value).trim() !== '');
  if (named) return;

  throw Object.assign(
    new Error(
      'Say who the material is going to — a department, a person, a job number, or a name. '
      + 'An issue with no recipient is a stock adjustment with extra steps.',
    ),
    { status: 400 },
  );
}

/**
 * Checks a proposed return against what is actually still out.
 *
 * Returns the lines annotated with the issue line they belong to, so the caller
 * posts stock against the same rows this validated rather than looking them up
 * a second time and hoping they match.
 */
export function planReturn({ issue, lines = [] }) {
  if (issue.status !== 'Issued' && issue.status !== 'Closed') {
    throw Object.assign(
      new Error(`Nothing has been issued on ${issue.issueNumber} yet, so nothing can come back`),
      { status: 409 },
    );
  }

  const byId = new Map(issue.StockIssueItems.map((item) => [Number(item.id), item]));
  // Several lines of one return can point at the same issue line — the same
  // bearings coming back partly good and partly crushed is one return with two
  // conditions. So the ceiling has to be checked against the running total, not
  // against each line on its own.
  const claimed = new Map();
  const planned = [];

  for (const line of lines) {
    const item = byId.get(Number(line.issueItemId));
    if (!item) {
      throw Object.assign(
        new Error(`Line ${line.issueItemId} is not on issue ${issue.issueNumber}`),
        { status: 400 },
      );
    }

    const amount = qty(line.quantity);
    if (amount <= 0) {
      throw Object.assign(new Error('A return quantity must be greater than zero'), { status: 400 });
    }

    const already = claimed.get(item.id) || 0;
    const room = qty(outstandingOn(item) - already);
    if (amount > room) {
      const name = item.Product?.productName || `product ${item.productId}`;
      throw Object.assign(
        new Error(
          `Cannot return ${amount} of ${name}: only ${room} is still out on ${issue.issueNumber}`,
        ),
        { status: 409 },
      );
    }

    claimed.set(item.id, qty(already + amount));
    planned.push({
      item,
      quantity: amount,
      condition: line.condition === 'Damaged' ? 'Damaged' : 'Good',
      // The lot it went out on, unless the caller names another. Putting it
      // back where it came from is what keeps the lot balances agreeing with
      // the branch balance.
      batchId: line.batchId ?? item.batchId ?? null,
      unitCost: line.unitCost ?? item.unitCost ?? item.Product?.purchasePrice ?? null,
      remarks: line.remarks || null,
    });
  }

  if (!planned.length) {
    throw Object.assign(new Error('A return needs at least one line'), { status: 400 });
  }
  return planned;
}

/** Live returns against an issue. Cancelled ones released their claim. */
export async function returnsFor(issueId, { transaction = null } = {}) {
  return StockIssueReturn.findAll({
    where: { issueId, detstatus: false, status: { [Op.ne]: 'Cancelled' } },
    attributes: ['id', 'returnNumber', 'returnDate', 'status'],
    transaction,
  });
}

/**
 * Proves the stored outstanding figures still agree with the return documents.
 *
 * `returnedQty` and `scrappedQty` are a balance held on the issue line so it can
 * be locked and contended for, which means they are the one place in this
 * feature where the same fact is written down twice. This recomputes them from
 * the posted returns, and anything it reports is drift — the thing the rest of
 * the system is careful never to allow. Used by the stock audit and by the
 * tests; cheap enough to run over a whole location.
 *
 * `closedQty` is deliberately not checked, because it has no document behind it
 * to check against: it is the quantity somebody declared consumed when they
 * closed the voucher. Folding it into `scrappedQty` would have made every
 * closed voucher look like drift, which is the fastest way to teach people to
 * ignore a drift report.
 */
export async function reconcileIssue(issueId) {
  const items = await StockIssueItem.findAll({ where: { issueId, detstatus: false } });
  const posted = await StockIssueReturn.findAll({
    where: { issueId, detstatus: false, status: 'Posted' },
    include: [{ model: StockIssueReturnItem, where: { detstatus: false }, required: false }],
  });

  const counted = new Map();
  for (const document of posted) {
    for (const line of document.StockIssueReturnItems || []) {
      const key = Number(line.issueItemId);
      const running = counted.get(key) || { returned: 0, scrapped: 0 };
      if (line.condition === 'Damaged') running.scrapped = qty(running.scrapped + qty(line.quantity));
      else running.returned = qty(running.returned + qty(line.quantity));
      counted.set(key, running);
    }
  }

  return items
    .map((item) => {
      const expected = counted.get(Number(item.id)) || { returned: 0, scrapped: 0 };
      return {
        issueItemId: item.id,
        productId: item.productId,
        storedReturned: qty(item.returnedQty),
        countedReturned: expected.returned,
        storedScrapped: qty(item.scrappedQty),
        countedScrapped: expected.scrapped,
      };
    })
    .filter((row) => (
      row.storedReturned !== row.countedReturned || row.storedScrapped !== row.countedScrapped
    ));
}
