import { Op } from 'sequelize';
import {
  sequelize, Branch, Department, Product, ProductBatch, StockIssue, StockIssueItem,
  StockIssueReturn, StockIssueReturnItem, User,
} from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { withDateRange } from '../../utils/dateRange.js';
import { postStockTransaction } from './stock.service.js';
import { postStockIssue, postIssueReturn } from '../accounting/accounting.service.js';
import { allocate, consume } from './batch.service.js';
import {
  assertHasRecipient, deriveIssueStatus, loadIssueForUpdate, outstandingOn,
  planReturn, progressOf,
} from './stockIssue.service.js';

/**
 * Store issue and material return.
 *
 * Both documents live in one controller because they are one operation seen
 * from two ends, and the arithmetic that connects them — how much of an issue
 * is still out — has to be applied identically by both. Splitting them would
 * mean two files each holding half of that rule.
 *
 * The shape follows the SRV deliberately, because this is its mirror: a Draft
 * that has moved nothing and can be edited freely, and a one-way posting step
 * that moves real stock. A posted document is corrected by raising the opposite
 * one, never by editing history.
 */

const ITEM_INCLUDE = {
  model: StockIssueItem,
  where: { detstatus: false },
  required: false,
  include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'purchasePrice'] }],
};

const HEADER_INCLUDE = [
  { model: Branch, attributes: ['id', 'branchName', 'branchCode'] },
  { model: Department, attributes: ['id', 'name', 'code'] },
  { model: User, as: 'issuedTo', attributes: ['id', 'name'] },
  { model: User, as: 'issuer', attributes: ['id', 'name'] },
];

async function nextIssueNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await StockIssue.count({
    where: { issueNumber: { [Op.like]: `SIV-${year}-%` } }, transaction,
  });
  return `SIV-${year}-${String(count + 1).padStart(5, '0')}`;
}

async function nextReturnNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await StockIssueReturn.count({
    where: { returnNumber: { [Op.like]: `MRN-${year}-%` } }, transaction,
  });
  return `MRN-${year}-${String(count + 1).padStart(5, '0')}`;
}

/** The issue as the screens want it: the record, plus what it now amounts to. */
function withProgress(issue) {
  const plain = issue.toJSON();
  const items = plain.StockIssueItems || [];
  return {
    ...plain,
    progress: progressOf(items),
    StockIssueItems: items.map((item) => ({ ...item, outstanding: outstandingOn(item) })),
  };
}

const reload = (id) => StockIssue.findOne({
  where: { id },
  include: [...HEADER_INCLUDE, ITEM_INCLUDE],
});

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export const listIssues = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'issueDate');
  if (req.query.status) where.status = req.query.status;
  if (req.query.purpose) where.purpose = req.query.purpose;
  if (req.query.departmentId) where.departmentId = req.query.departmentId;
  if (req.query.issuedToUserId) where.issuedToUserId = req.query.issuedToUserId;
  if (req.query.search) where.issueNumber = { [Op.like]: `%${req.query.search}%` };

  const { rows, count } = await StockIssue.findAndCountAll({
    where,
    distinct: true,
    include: [...HEADER_INCLUDE, ITEM_INCLUDE],
    limit,
    offset,
    order: [['issueDate', 'DESC'], ['id', 'DESC']],
  });
  res.json(paged(rows.map(withProgress), count, page, limit));
});

/**
 * What is still out, and with whom.
 *
 * The report the document pair exists for. Only returnable issues appear:
 * consumables left the building on purpose and are not outstanding in any sense
 * anybody cares about, and listing them would bury the tools and the loans that
 * genuinely need chasing.
 */
export const outstandingIssues = asyncHandler(async (req, res) => {
  const where = scopedWhere(req, { detstatus: false, status: 'Issued', returnable: true });
  if (req.query.departmentId) where.departmentId = req.query.departmentId;
  if (req.query.issuedToUserId) where.issuedToUserId = req.query.issuedToUserId;

  const issues = await StockIssue.findAll({
    where,
    include: [...HEADER_INCLUDE, ITEM_INCLUDE],
    order: [['issueDate', 'ASC']],
  });

  const rows = issues
    .map(withProgress)
    .filter((issue) => issue.progress.outstanding > 0)
    .map((issue) => ({
      ...issue,
      // How long it has been out. The figure anybody chasing a missing tool
      // actually sorts by.
      daysOut: Math.max(0, Math.floor(
        (Date.now() - new Date(issue.issuedAt || issue.issueDate).getTime()) / 86400000,
      )),
      StockIssueItems: issue.StockIssueItems.filter((item) => item.outstanding > 0),
    }));

  res.json({
    data: rows,
    totals: {
      vouchers: rows.length,
      units: rows.reduce((sum, issue) => sum + issue.progress.outstanding, 0),
    },
  });
});

export const getIssue = asyncHandler(async (req, res) => {
  const issue = await StockIssue.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      ...HEADER_INCLUDE,
      ITEM_INCLUDE,
      {
        model: StockIssueReturn,
        where: { detstatus: false },
        required: false,
        include: [{ model: StockIssueReturnItem, where: { detstatus: false }, required: false }],
      },
    ],
  });
  if (!issue) return res.status(404).json({ message: 'Store issue not found' });
  res.json(withProgress(issue));
});

export const createIssue = asyncHandler(async (req, res) => {
  assertHasRecipient(req.body);

  const created = await sequelize.transaction(async (transaction) => {
    const issue = await StockIssue.create({
      issueNumber: req.body.issueNumber || await nextIssueNumber(transaction),
      issueDate: req.body.issueDate,
      branchId: req.branchId,
      status: 'Draft',
      purpose: req.body.purpose || 'Consumption',
      returnable: req.body.returnable !== undefined ? Boolean(req.body.returnable) : true,
      departmentId: req.body.departmentId || null,
      issuedToUserId: req.body.issuedToUserId || null,
      issuedToName: req.body.issuedToName || null,
      jobNumber: req.body.jobNumber || null,
      remarks: req.body.remarks || null,
      authadd: req.user.id,
    }, { transaction });

    await StockIssueItem.bulkCreate((req.body.items || []).map((item) => ({
      issueId: issue.id,
      productId: item.productId,
      quantity: item.quantity,
      batchId: item.batchId || null,
      batchNumber: item.batchNumber || null,
      unitCost: item.unitCost ?? null,
      remarks: item.remarks || null,
      authadd: req.user.id,
    })), { transaction });

    return issue;
  });

  res.status(201).json(withProgress(await reload(created.id)));
});

export const updateIssue = asyncHandler(async (req, res) => {
  assertHasRecipient({ ...req.body });

  const updated = await sequelize.transaction(async (transaction) => {
    const issue = await loadIssueForUpdate(req.params.id, transaction);
    if (issue.status !== 'Draft') {
      throw Object.assign(
        new Error(`Only a Draft issue can be edited — ${issue.issueNumber} is ${issue.status}`),
        { status: 400 },
      );
    }

    await issue.update({
      issueDate: req.body.issueDate || issue.issueDate,
      purpose: req.body.purpose || issue.purpose,
      returnable: req.body.returnable !== undefined ? Boolean(req.body.returnable) : issue.returnable,
      departmentId: req.body.departmentId ?? issue.departmentId,
      issuedToUserId: req.body.issuedToUserId ?? issue.issuedToUserId,
      issuedToName: req.body.issuedToName ?? issue.issuedToName,
      jobNumber: req.body.jobNumber ?? issue.jobNumber,
      remarks: req.body.remarks ?? issue.remarks,
      authlstedit: req.user.id,
    }, { transaction });

    if (req.body.items) {
      await StockIssueItem.destroy({ where: { issueId: issue.id }, transaction });
      await StockIssueItem.bulkCreate(req.body.items.map((item) => ({
        issueId: issue.id,
        productId: item.productId,
        quantity: item.quantity,
        batchId: item.batchId || null,
        batchNumber: item.batchNumber || null,
        unitCost: item.unitCost ?? null,
        remarks: item.remarks || null,
        authadd: req.user.id,
      })), { transaction });
    }
    return issue;
  });

  res.json(withProgress(await reload(updated.id)));
});

/**
 * Posts the voucher: the material actually leaves the store.
 *
 * One-way, like posting an SRV. A saved Draft has moved nothing, which is what
 * makes it safe to check and correct; this is the deliberate act that moves
 * stock, and after it the way back is a return rather than an edit.
 *
 * Lines are re-written into one row per lot as they are posted. A line for 12
 * bearings that comes off two lots becomes two rows of 7 and 5, because that is
 * what physically left — and because a return has to go back to the lot it came
 * from, which a single row averaging two lots could not say. Nothing references
 * the Draft's rows yet (a return can only exist after this step), so replacing
 * them here costs nothing.
 */
export const postIssue = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const issue = await loadIssueForUpdate(req.params.id, transaction);
    if (issue.status !== 'Draft') {
      throw Object.assign(
        new Error(`Cannot issue ${issue.issueNumber} — it is already ${issue.status}`),
        { status: 409 },
      );
    }
    if (!issue.StockIssueItems.length) {
      throw Object.assign(new Error('Add at least one product before issuing'), { status: 400 });
    }

    let consumedValue = 0;
    const rows = [];

    for (const item of issue.StockIssueItems) {
      const quantity = Number(item.quantity);
      if (!(quantity > 0)) {
        throw Object.assign(new Error('An issue quantity must be greater than zero'), { status: 400 });
      }

      // Which lots this comes off. Empty for a product with no lots recorded,
      // which then posts as a single untracked row exactly as before.
      const allocations = await allocate({
        productId: item.productId,
        branchId: issue.branchId,
        quantity,
        batchId: item.batchId,
        transaction,
      });
      if (allocations.length) await consume(allocations, { transaction, userId: req.user.id });

      const unitCost = item.unitCost ?? item.Product?.purchasePrice ?? 0;
      const parts = allocations.length
        ? allocations.map((a) => ({ quantity: Number(a.quantity), batch: a.batch }))
        : [{ quantity, batch: null }];

      for (const part of parts) {
        rows.push({
          issueId: issue.id,
          productId: item.productId,
          quantity: part.quantity,
          batchId: part.batch?.id || null,
          batchNumber: part.batch?.batchNumber || item.batchNumber || null,
          unitCost,
          remarks: item.remarks || null,
          authadd: req.user.id,
        });
        consumedValue += Number(unitCost) * part.quantity;

        await postStockTransaction({
          productId: item.productId,
          branchId: issue.branchId,
          quantity: -part.quantity,
          movementType: 'Issue',
          referenceType: 'StockIssue',
          referenceId: issue.id,
          referenceNumber: issue.issueNumber,
          batchId: part.batch?.id || null,
          unitCost,
          transactionDate: issue.issueDate,
          notes: `Issued ${part.quantity} ${item.Product?.primaryUnit || 'PCS'} on ${issue.issueNumber}`,
          transaction,
          userId: req.user.id,
        });
      }
    }

    await StockIssueItem.destroy({ where: { issueId: issue.id }, transaction });
    await StockIssueItem.bulkCreate(rows, { transaction });

    await issue.update({
      // A non-returnable issue is finished the moment it is posted: nothing is
      // expected back, so it never belongs on the outstanding report.
      status: issue.returnable ? 'Issued' : 'Closed',
      issuedBy: req.user.id,
      issuedAt: new Date(),
      closedAt: issue.returnable ? null : new Date(),
      authlstedit: req.user.id,
    }, { transaction });

    // Books the cost against materials consumed. No-op unless the accounting
    // module is on, so a shop with no chart of accounts is unaffected.
    await postStockIssue({ issue, consumedValue, transaction, userId: req.user.id });
  });

  res.json(withProgress(await reload(req.params.id)));
});

/**
 * Says the rest is not coming back.
 *
 * The honest end for the ordinary case where six of the twelve bolts went into
 * the machine and nobody is going to file paperwork about the other six. It
 * moves no stock — the material left at issue and it is still gone — it only
 * stops the voucher appearing on the outstanding report for ever.
 *
 * The remainder is recorded against `closedQty`, kept apart from the scrap that
 * comes back on a return note. Both are quantity that is never returning, but
 * only one of them has a document and a witness behind it, and the
 * reconciliation can only check the one that does.
 */
export const closeIssue = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const issue = await loadIssueForUpdate(req.params.id, transaction);
    if (issue.status !== 'Issued') {
      throw Object.assign(
        new Error(`Only an issued voucher can be closed — ${issue.issueNumber} is ${issue.status}`),
        { status: 409 },
      );
    }

    for (const item of issue.StockIssueItems) {
      const remaining = outstandingOn(item);
      if (remaining <= 0) continue;
      await item.update({
        closedQty: Number(item.closedQty) + remaining,
        authlstedit: req.user.id,
      }, { transaction });
    }

    await issue.update({
      status: 'Closed',
      closedAt: new Date(),
      remarks: req.body?.remarks
        ? `${issue.remarks ? `${issue.remarks}\n` : ''}Closed: ${req.body.remarks}`
        : issue.remarks,
      authlstedit: req.user.id,
    }, { transaction });
  });

  res.json(withProgress(await reload(req.params.id)));
});

export const removeIssue = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const issue = await loadIssueForUpdate(req.params.id, transaction);
    if (issue.status !== 'Draft') {
      throw Object.assign(
        new Error(
          `${issue.issueNumber} has already moved stock and cannot be deleted. `
          + 'Return the material against it instead — that is the record of it coming back.',
        ),
        { status: 409 },
      );
    }
    await issue.update({
      detstatus: true, status: 'Cancelled', authdel: req.user.id, delondt: new Date(),
    }, { transaction });
  });

  res.json({ message: 'Draft issue cancelled' });
});

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

const RETURN_INCLUDE = [
  { model: StockIssue, attributes: ['id', 'issueNumber', 'issueDate', 'purpose', 'status'] },
  { model: Branch, attributes: ['id', 'branchName'] },
  { model: User, as: 'returnedBy', attributes: ['id', 'name'] },
  { model: User, as: 'receiver', attributes: ['id', 'name'] },
  {
    model: StockIssueReturnItem,
    where: { detstatus: false },
    required: false,
    include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit'] }],
  },
];

export const listReturns = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'returnDate');
  if (req.query.status) where.status = req.query.status;
  if (req.query.issueId) where.issueId = req.query.issueId;
  if (req.query.search) where.returnNumber = { [Op.like]: `%${req.query.search}%` };

  const { rows, count } = await StockIssueReturn.findAndCountAll({
    where,
    distinct: true,
    include: RETURN_INCLUDE,
    limit,
    offset,
    order: [['returnDate', 'DESC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const getReturn = asyncHandler(async (req, res) => {
  const document = await StockIssueReturn.findOne({
    where: { id: req.params.id, detstatus: false },
    include: RETURN_INCLUDE,
  });
  if (!document) return res.status(404).json({ message: 'Material return not found' });
  res.json(document);
});

/**
 * Raises a Draft return against an issue.
 *
 * Checked against what is still out here as well as at posting. The check at
 * posting is the one that counts — it is the one inside the lock — but failing
 * at the point somebody typed the quantity is worth more to them than failing
 * two clicks later.
 */
export const createReturn = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const issue = await loadIssueForUpdate(req.params.id, transaction);
    const planned = planReturn({ issue, lines: req.body.items || [] });

    const document = await StockIssueReturn.create({
      returnNumber: req.body.returnNumber || await nextReturnNumber(transaction),
      returnDate: req.body.returnDate || new Date().toISOString().slice(0, 10),
      branchId: issue.branchId,
      issueId: issue.id,
      status: 'Draft',
      returnedByUserId: req.body.returnedByUserId || issue.issuedToUserId || null,
      returnedByName: req.body.returnedByName || issue.issuedToName || null,
      remarks: req.body.remarks || null,
      authadd: req.user.id,
    }, { transaction });

    await StockIssueReturnItem.bulkCreate(planned.map((line) => ({
      returnId: document.id,
      issueItemId: line.item.id,
      productId: line.item.productId,
      quantity: line.quantity,
      condition: line.condition,
      batchId: line.batchId,
      unitCost: line.unitCost,
      remarks: line.remarks,
      authadd: req.user.id,
    })), { transaction });

    return document;
  });

  res.status(201).json(await StockIssueReturn.findOne({
    where: { id: created.id }, include: RETURN_INCLUDE,
  }));
});

/**
 * Posts the return: good material goes back on the shelf.
 *
 * Damaged material does not. It closes the outstanding quantity and stops
 * there, because it is not stock any more — it left at issue and it is not
 * coming back into anything sellable. Bringing it in so a write-off could
 * immediately take it out again would put two movements against one event and
 * leave the shelf figure momentarily claiming goods that are in a skip.
 */
export const postReturn = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const document = await StockIssueReturn.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [{ model: StockIssueReturnItem, where: { detstatus: false }, required: false }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!document) throw Object.assign(new Error('Material return not found'), { status: 404 });
    if (document.status !== 'Draft') {
      throw Object.assign(
        new Error(`Cannot post ${document.returnNumber} — it is already ${document.status}`),
        { status: 409 },
      );
    }

    // Locked here, and the plan is rebuilt from the current outstanding rather
    // than trusted from when the Draft was saved. Between the two, somebody
    // else may have returned against the same voucher.
    const issue = await loadIssueForUpdate(document.issueId, transaction);
    const planned = planReturn({
      issue,
      lines: (document.StockIssueReturnItems || []).map((line) => ({
        issueItemId: line.issueItemId,
        quantity: line.quantity,
        condition: line.condition,
        batchId: line.batchId,
        unitCost: line.unitCost,
      })),
    });

    let goodValue = 0;
    let scrapValue = 0;

    for (const line of planned) {
      const { item, quantity, condition } = line;
      const value = Number(line.unitCost || 0) * quantity;

      if (condition === 'Good') {
        goodValue += value;

        await postStockTransaction({
          productId: item.productId,
          branchId: issue.branchId,
          quantity,
          movementType: 'Issue Return',
          referenceType: 'StockIssueReturn',
          referenceId: document.id,
          referenceNumber: document.returnNumber,
          batchId: line.batchId,
          unitCost: line.unitCost,
          transactionDate: document.returnDate,
          notes: `Returned ${quantity} against ${issue.issueNumber} on ${document.returnNumber}`,
          transaction,
          userId: req.user.id,
        });

        // Back into the lot it came out of, so the sum of the lots keeps
        // agreeing with the branch balance the movement above just changed.
        if (line.batchId) {
          const batch = await ProductBatch.findByPk(line.batchId, { transaction });
          if (batch) await consume([{ batch, quantity }], { transaction, userId: req.user.id, sign: 1 });
        }

        await item.update({
          returnedQty: Number(item.returnedQty) + quantity,
          authlstedit: req.user.id,
        }, { transaction });
      } else {
        scrapValue += value;
        await item.update({
          scrappedQty: Number(item.scrappedQty) + quantity,
          authlstedit: req.user.id,
        }, { transaction });
      }
    }

    await document.update({
      status: 'Posted',
      receivedBy: req.user.id,
      postedAt: new Date(),
      authlstedit: req.user.id,
    }, { transaction });

    // Reloaded rather than reusing the rows above, because those were updated
    // one at a time and the status is a statement about all of them together.
    const refreshed = await StockIssueItem.findAll({
      where: { issueId: issue.id, detstatus: false }, transaction,
    });
    const next = deriveIssueStatus(issue, refreshed);
    if (next !== issue.status) {
      await issue.update({
        status: next,
        closedAt: next === 'Closed' ? new Date() : issue.closedAt,
        authlstedit: req.user.id,
      }, { transaction });
    }

    await postIssueReturn({
      issueReturn: document, issue, goodValue, scrapValue, transaction, userId: req.user.id,
    });
  });

  res.json(await StockIssueReturn.findOne({
    where: { id: req.params.id }, include: RETURN_INCLUDE,
  }));
});

export const removeReturn = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const document = await StockIssueReturn.findOne({
      where: { id: req.params.id, detstatus: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!document) throw Object.assign(new Error('Material return not found'), { status: 404 });
    if (document.status === 'Posted') {
      throw Object.assign(
        new Error(
          `${document.returnNumber} has already put stock back and cannot be deleted. `
          + 'Issue the material again if it needs to go back out.',
        ),
        { status: 409 },
      );
    }
    await document.update({
      detstatus: true, status: 'Cancelled', authdel: req.user.id, delondt: new Date(),
    }, { transaction });
  });

  res.json({ message: 'Draft return cancelled' });
});
