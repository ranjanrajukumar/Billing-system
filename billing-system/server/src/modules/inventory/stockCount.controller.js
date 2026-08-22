import { Op } from 'sequelize';
import {
  BinStock, Branch, BranchStock, Product, sequelize, StockAdjustment,
  StockAdjustmentItem, StockCount, StockCountItem, WarehouseBin,
} from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { withDateRange } from '../../utils/dateRange.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { getBranchStock, postStockTransaction } from './stock.service.js';
import { postStockAdjustment } from '../accounting/accounting.service.js';
import { isCleared, requestApproval } from '../platform/approval.service.js';

/**
 * Physical stock counting.
 *
 * Opening a count freezes the system quantity onto every line. That frozen
 * figure is what the variance is measured against — comparing a count taken at
 * 9am to a book figure read at 5pm would mostly measure the day's trading.
 */

const ITEM_INCLUDE = {
  model: StockCountItem,
  include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'purchasePrice'] }],
};

/**
 * Sets a bin's quantity to what was physically counted.
 *
 * Absolute rather than a delta: the counter's figure *is* the truth for that
 * shelf, and applying a difference would re-introduce whatever the books were
 * wrong about.
 */
async function adjustBinForCount({ binId, branchId, productId, batchId, quantity, transaction, userId }) {
  const [row] = await BinStock.findOrCreate({
    where: { binId, productId, batchId: batchId ?? null },
    defaults: { binId, branchId, productId, batchId: batchId ?? null, quantity: 0, authadd: userId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  await row.update({ quantity: Math.max(0, Number(quantity)), authlstedit: userId }, { transaction });
}

async function nextNumber(model, prefix, transaction) {
  const year = new Date().getFullYear();
  const field = model === StockCount ? 'countNumber' : 'adjustmentNumber';
  const count = await model.count({
    where: { [field]: { [Op.like]: `${prefix}-${year}-%` } },
    transaction,
  });
  return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'countDate');
  if (req.query.status) where.status = req.query.status;

  const { rows, count } = await StockCount.findAndCountAll({
    where,
    distinct: true,
    include: [{ model: Branch, attributes: ['id', 'branchName', 'locationType'] }, ITEM_INCLUDE],
    limit,
    offset,
    order: [['countDate', 'DESC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const row = await StockCount.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: Branch, attributes: ['id', 'branchName', 'locationType'] }, ITEM_INCLUDE],
  });
  if (!row) return res.status(404).json({ message: 'Stock count not found' });
  res.json(row);
});

/**
 * Opens a count sheet. With no products given it takes everything the location
 * holds, which is what a full stock take means.
 */
export const create = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const branchId = Number(req.body.branchId || req.branchId);
    // A bin-scoped count is a cycle count: one shelf at a time, without
    // stopping the warehouse to take a full inventory.
    const binId = req.body.binId ? Number(req.body.binId) : null;
    const scope = binId ? 'Bin' : 'Location';

    let lines = [];

    if (binId) {
      const bin = await WarehouseBin.findOne({
        where: { id: binId, branchId, detstatus: false },
        transaction,
      });
      if (!bin) throw Object.assign(new Error('Bin not found at this location'), { status: 404 });

      const contents = await BinStock.findAll({
        where: { binId, detstatus: false },
        include: [{ model: Product, attributes: ['id', 'purchasePrice'], where: { detstatus: false } }],
        transaction,
      });
      if (!contents.length) {
        throw Object.assign(new Error(`Bin ${bin.code} is empty — nothing to count`), { status: 400 });
      }

      lines = contents.map((row) => ({
        productId: row.productId,
        binId,
        batchId: row.batchId,
        // For a cycle count the system figure is what the *bin* should hold,
        // not what the whole location does.
        systemQuantity: Number(row.quantity),
        unitCost: row.Product?.purchasePrice ?? null,
      }));
    } else {
      let productIds = (req.body.productIds || []).map(Number).filter(Boolean);
      if (!productIds.length) {
        const held = await BranchStock.findAll({
          where: { branchId },
          include: [{ model: Product, attributes: ['id'], where: { detstatus: false, isActive: true } }],
          transaction,
        });
        productIds = held.map((row) => row.productId);
      }
      if (!productIds.length) {
        throw Object.assign(new Error('This location holds no stock to count'), { status: 400 });
      }

      const products = await Product.findAll({ where: { id: productIds }, transaction });
      const byId = new Map(products.map((p) => [p.id, p]));

      for (const productId of productIds) {
        lines.push({
          productId,
          binId: null,
          systemQuantity: await getBranchStock(productId, branchId, transaction),
          unitCost: byId.get(productId)?.purchasePrice ?? null,
        });
      }
    }

    const count = await StockCount.create({
      countNumber: req.body.countNumber || await nextNumber(StockCount, 'CNT', transaction),
      countDate: req.body.countDate || new Date().toISOString().slice(0, 10),
      branchId,
      scope,
      binId,
      status: 'Counting',
      countedBy: req.user.id,
      remarks: req.body.remarks || null,
      authadd: req.user.id,
    }, { transaction });

    await StockCountItem.bulkCreate(lines.map((line) => ({
      ...line,
      countId: count.id,
      physicalQuantity: null,
      variance: 0,
      authadd: req.user.id,
    })), { transaction });

    return count;
  });

  res.status(201).json(await StockCount.findByPk(created.id, { include: [ITEM_INCLUDE] }));
});

/** Records counted figures. Lines left uncounted stay null and are ignored later. */
export const saveCounts = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const count = await StockCount.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [StockCountItem],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!count) throw Object.assign(new Error('Stock count not found'), { status: 404 });
    if (!['Draft', 'Counting', 'Pending'].includes(count.status)) {
      throw Object.assign(new Error(`A ${count.status.toLowerCase()} count cannot be edited`), { status: 409 });
    }

    const byId = new Map((req.body.items || []).map((l) => [Number(l.id), l]));
    let varianceQty = 0;
    let varianceValue = 0;

    for (const item of count.StockCountItems) {
      const line = byId.get(item.id);
      if (!line || line.physicalQuantity === undefined || line.physicalQuantity === null || line.physicalQuantity === '') continue;

      const physical = Number(line.physicalQuantity);
      const variance = physical - Number(item.systemQuantity);
      await item.update({
        physicalQuantity: physical,
        variance,
        remarks: line.remarks ?? item.remarks,
        authlstedit: req.user.id,
      }, { transaction });

      varianceQty += Math.abs(variance);
      varianceValue += Math.abs(variance * Number(item.unitCost || 0));
    }

    const status = req.body.submit ? 'Pending' : 'Counting';
    await count.update({ status, authlstedit: req.user.id }, { transaction });

    // Submitting for approval is when a big variance needs a manager's eye.
    if (req.body.submit) {
      await requestApproval({
        documentType: 'StockCount',
        documentId: count.id,
        documentNumber: count.countNumber,
        values: { varianceQty, varianceValue, quantity: varianceQty, grandTotal: varianceValue },
        branchId: count.branchId,
        userId: req.user.id,
        transaction,
      });
    }

    return count;
  });

  res.json(await StockCount.findByPk(result.id, { include: [ITEM_INCLUDE] }));
});

/**
 * Approving posts the variance: an adjustment document is raised and applied,
 * so the correction appears in the stock ledger as a stock count adjustment
 * rather than as an unexplained change in the numbers.
 */
export const approve = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const count = await StockCount.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [StockCountItem],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!count) throw Object.assign(new Error('Stock count not found'), { status: 404 });
    if (count.status === 'Approved') {
      throw Object.assign(new Error('This count has already been posted'), { status: 409 });
    }
    if (!await isCleared({ documentType: 'StockCount', documentId: count.id, transaction })) {
      throw Object.assign(new Error('This count is still waiting for approval'), { status: 409 });
    }

    const varianceLines = count.StockCountItems.filter(
      (item) => item.physicalQuantity !== null && Number(item.variance) !== 0,
    );

    let adjustment = null;
    if (varianceLines.length) {
      const value = varianceLines.reduce(
        (sum, item) => sum + Number(item.variance) * Number(item.unitCost || 0), 0,
      );

      adjustment = await StockAdjustment.create({
        adjustmentNumber: await nextNumber(StockAdjustment, 'ADJ', transaction),
        adjustmentDate: count.countDate,
        branchId: count.branchId,
        reason: 'Stock Count',
        status: 'Approved',
        referenceType: 'StockCount',
        referenceId: count.id,
        approvedBy: req.user.id,
        approvedAt: new Date(),
        totalValue: value,
        remarks: `Variance posted from stock count ${count.countNumber}`,
        authadd: req.user.id,
      }, { transaction });

      await StockAdjustmentItem.bulkCreate(varianceLines.map((item) => ({
        adjustmentId: adjustment.id,
        productId: item.productId,
        batchId: item.batchId || null,
        quantity: Number(item.variance),
        systemQuantity: Number(item.systemQuantity),
        unitCost: item.unitCost,
        remarks: `Counted ${item.physicalQuantity} against ${item.systemQuantity}`,
        authadd: req.user.id,
      })), { transaction });

      for (const item of varianceLines) {
        await postStockTransaction({
          productId: item.productId,
          branchId: count.branchId,
          quantity: Number(item.variance),
          movementType: 'Stock Count Adjustment',
          referenceType: 'Stock Count',
          referenceId: count.id,
          referenceNumber: count.countNumber,
          batchId: item.batchId,
          unitCost: item.unitCost,
          transactionDate: count.countDate,
          notes: item.binId
            ? `Cycle count: bin held ${item.physicalQuantity}, system said ${item.systemQuantity}`
            : `Counted ${item.physicalQuantity}, system said ${item.systemQuantity}`,
          transaction,
          userId: req.user.id,
        });

        // A cycle count corrects the shelf as well as the location total.
        // Correcting only one would leave the bin and the location disagreeing
        // the moment the count was signed off — the exact drift a count exists
        // to remove.
        if (item.binId) {
          await adjustBinForCount({
            binId: item.binId,
            branchId: count.branchId,
            productId: item.productId,
            batchId: item.batchId,
            quantity: Number(item.physicalQuantity),
            transaction,
            userId: req.user.id,
          });
        }
      }

      await postStockAdjustment({ adjustment, value, transaction, userId: req.user.id });
    }

    await count.update({
      status: 'Approved',
      approvedBy: req.user.id,
      approvedAt: new Date(),
      adjustmentId: adjustment?.id || null,
      authlstedit: req.user.id,
    }, { transaction });

    return count;
  });

  res.json(await StockCount.findByPk(result.id, { include: [ITEM_INCLUDE] }));
});

export const cancel = asyncHandler(async (req, res) => {
  const count = await StockCount.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!count) return res.status(404).json({ message: 'Stock count not found' });
  if (count.status === 'Approved') {
    return res.status(409).json({ message: 'A posted count cannot be cancelled' });
  }
  await count.update({ status: 'Cancelled', authlstedit: req.user.id });
  res.json(count);
});
