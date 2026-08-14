import { Op } from 'sequelize';
import {
  Branch, Product, sequelize, StockAdjustment, StockAdjustmentItem, User,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { withDateRange } from '../utils/dateRange.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { getBranchStock, postStockTransaction } from '../services/stock.service.js';
import { postStockAdjustment } from '../services/accounting.service.js';
import { cancelFor, isCleared, requestApproval } from '../services/approval.service.js';

/**
 * Deliberate corrections to stock: damage, expiry, loss, a found box.
 *
 * Nothing here touches stock until the adjustment is approved. Writing
 * inventory off is the easiest way to hide a shortage, so it is the one place
 * where a second name on the record is worth the extra step.
 */

const ITEM_INCLUDE = {
  model: StockAdjustmentItem,
  include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'purchasePrice'] }],
};

/** The movement type that best describes why stock is being changed. */
const MOVEMENT_FOR_REASON = {
  Damage: 'Damage',
  Expired: 'Expired',
  'Stock Count': 'Stock Count Adjustment',
  'Opening Stock': 'Opening Stock',
};

async function nextNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await StockAdjustment.count({
    where: { adjustmentNumber: { [Op.like]: `ADJ-${year}-%` } },
    transaction,
  });
  return `ADJ-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'adjustmentDate');
  if (req.query.status) where.status = req.query.status;
  if (req.query.reason) where.reason = req.query.reason;

  const { rows, count } = await StockAdjustment.findAndCountAll({
    where,
    distinct: true,
    include: [
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
      { model: User, as: 'approver', attributes: ['id', 'name'] },
      ITEM_INCLUDE,
    ],
    limit,
    offset,
    order: [['adjustmentDate', 'DESC'], ['id', 'DESC']],
  });

  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const row = await StockAdjustment.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
      { model: User, as: 'approver', attributes: ['id', 'name'] },
      ITEM_INCLUDE,
    ],
  });
  if (!row) return res.status(404).json({ message: 'Adjustment not found' });
  res.json(row);
});

export const create = asyncHandler(async (req, res) => {
  const { items = [], ...data } = req.body;
  if (!items.length) return res.status(400).json({ message: 'Add at least one line to adjust' });

  const created = await sequelize.transaction(async (transaction) => {
    const branchId = Number(data.branchId || req.branchId);
    const products = await Product.findAll({ where: { id: items.map((i) => i.productId) }, transaction });
    const byId = new Map(products.map((p) => [p.id, p]));

    // The system figure is recorded now so the approver can see what was
    // believed at the time the adjustment was raised.
    const lines = [];
    let totalValue = 0;
    for (const item of items) {
      const product = byId.get(Number(item.productId));
      if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });

      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity === 0) {
        throw Object.assign(new Error(`Adjustment quantity for ${product.productName} must be a non-zero number`), { status: 400 });
      }

      const unitCost = Number(item.unitCost ?? product.purchasePrice ?? 0);
      totalValue += unitCost * quantity;
      lines.push({
        productId: product.id,
        batchId: item.batchId || null,
        batchNumber: item.batchNumber || null,
        quantity,
        systemQuantity: await getBranchStock(product.id, branchId, transaction),
        unitCost,
        remarks: item.remarks || null,
        authadd: req.user.id,
      });
    }

    const adjustment = await StockAdjustment.create({
      adjustmentNumber: data.adjustmentNumber || await nextNumber(transaction),
      adjustmentDate: data.adjustmentDate || new Date().toISOString().slice(0, 10),
      branchId,
      reason: data.reason || 'Correction',
      status: 'Pending',
      referenceType: data.referenceType || null,
      referenceId: data.referenceId || null,
      totalValue,
      remarks: data.remarks || null,
      authadd: req.user.id,
    }, { transaction });

    await StockAdjustmentItem.bulkCreate(
      lines.map((line) => ({ ...line, adjustmentId: adjustment.id })),
      { transaction },
    );

    await requestApproval({
      documentType: 'StockAdjustment',
      documentId: adjustment.id,
      documentNumber: adjustment.adjustmentNumber,
      values: {
        quantity: lines.reduce((sum, l) => sum + Math.abs(l.quantity), 0),
        totalQuantity: lines.reduce((sum, l) => sum + Math.abs(l.quantity), 0),
        grandTotal: Math.abs(totalValue),
        varianceValue: Math.abs(totalValue),
        varianceQty: lines.reduce((sum, l) => sum + Math.abs(l.quantity), 0),
      },
      branchId,
      userId: req.user.id,
      transaction,
    });

    return adjustment;
  });

  res.status(201).json(await StockAdjustment.findByPk(created.id, { include: [ITEM_INCLUDE] }));
});

/**
 * Approving is what actually moves the stock, writes the ledger rows and books
 * the value of what was lost or found.
 */
export const approve = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const adjustment = await StockAdjustment.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [StockAdjustmentItem],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!adjustment) throw Object.assign(new Error('Adjustment not found'), { status: 404 });
    if (adjustment.status === 'Approved') {
      throw Object.assign(new Error('This adjustment has already been applied'), { status: 409 });
    }
    if (['Rejected', 'Cancelled'].includes(adjustment.status)) {
      throw Object.assign(new Error(`A ${adjustment.status.toLowerCase()} adjustment cannot be applied`), { status: 409 });
    }
    if (!await isCleared({ documentType: 'StockAdjustment', documentId: adjustment.id, transaction })) {
      throw Object.assign(new Error('This adjustment is still waiting for approval'), { status: 409 });
    }

    let value = 0;
    for (const item of adjustment.StockAdjustmentItems) {
      const quantity = Number(item.quantity);
      const movementType = MOVEMENT_FOR_REASON[adjustment.reason]
        || (quantity > 0 ? 'Adjustment In' : 'Adjustment Out');

      await postStockTransaction({
        productId: item.productId,
        branchId: adjustment.branchId,
        quantity,
        movementType,
        referenceType: 'Stock Adjustment',
        referenceId: adjustment.id,
        referenceNumber: adjustment.adjustmentNumber,
        batchId: item.batchId,
        unitCost: item.unitCost,
        notes: item.remarks || `${adjustment.reason} — ${adjustment.adjustmentNumber}`,
        transactionDate: adjustment.adjustmentDate,
        transaction,
        userId: req.user.id,
      });

      value += Number(item.unitCost || 0) * quantity;
    }

    await adjustment.update({
      status: 'Approved',
      approvedBy: req.user.id,
      approvedAt: new Date(),
      totalValue: value,
      authlstedit: req.user.id,
    }, { transaction });

    await postStockAdjustment({ adjustment, value, transaction, userId: req.user.id });
    return adjustment;
  });

  res.json(await StockAdjustment.findByPk(result.id, { include: [ITEM_INCLUDE] }));
});

export const reject = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const adjustment = await StockAdjustment.findOne({
      where: { id: req.params.id, detstatus: false }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!adjustment) throw Object.assign(new Error('Adjustment not found'), { status: 404 });
    if (adjustment.status === 'Approved') {
      throw Object.assign(new Error('An applied adjustment cannot be rejected; raise a reversing one instead'), { status: 409 });
    }

    await cancelFor({ documentType: 'StockAdjustment', documentId: adjustment.id, userId: req.user.id, transaction });
    await adjustment.update({
      status: 'Rejected',
      remarks: req.body.reason || adjustment.remarks,
      authlstedit: req.user.id,
    }, { transaction });
    return adjustment;
  });
  res.json(result);
});
