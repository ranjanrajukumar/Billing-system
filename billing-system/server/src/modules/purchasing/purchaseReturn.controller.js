import { Op } from 'sequelize';
import {
  Branch, JournalEntry, Product, ProductBatch, Purchase, PurchaseItem,
  PurchaseReturn, PurchaseReturnItem, sequelize, Supplier,
} from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { withDateRange } from '../../utils/dateRange.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { assertAvailable, postStockTransaction } from '../inventory/stock.service.js';
import { unitSnapshot } from '../../utils/units.js';
import { postPurchaseReturn, reverseEntry } from '../accounting/accounting.service.js';

/**
 * Goods sent back to a supplier.
 *
 * The original purchase is never touched. Confirming a return takes the stock
 * out, raises a debit note and reduces what we owe — so the record shows both
 * that we bought it and that we sent it back, which is what a supplier dispute
 * is argued from.
 */

const ITEM_INCLUDE = {
  model: PurchaseReturnItem,
  include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'unitConversionFactor'] }],
};

async function nextNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await PurchaseReturn.count({
    where: { returnNumber: { [Op.like]: `PR-${year}-%` } },
    transaction,
  });
  return `PR-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'returnDate');
  if (req.query.status) where.status = req.query.status;
  if (req.query.supplierId) where.supplierId = req.query.supplierId;

  const { rows, count } = await PurchaseReturn.findAndCountAll({
    where,
    distinct: true,
    include: [
      Supplier,
      { model: Purchase, attributes: ['id', 'purchaseNumber', 'purchaseDate'] },
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
      ITEM_INCLUDE,
    ],
    limit,
    offset,
    order: [['returnDate', 'DESC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const row = await PurchaseReturn.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      Supplier,
      { model: Purchase, attributes: ['id', 'purchaseNumber', 'purchaseDate'] },
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
      ITEM_INCLUDE,
    ],
  });
  if (!row) return res.status(404).json({ message: 'Purchase return not found' });
  res.json(row);
});

export const create = asyncHandler(async (req, res) => {
  const { items = [], ...data } = req.body;
  if (!items.length) return res.status(400).json({ message: 'Add at least one product to return' });

  const created = await sequelize.transaction(async (transaction) => {
    let purchase = null;
    if (data.purchaseId) {
      purchase = await Purchase.findOne({
        where: { id: data.purchaseId, detstatus: false },
        include: [PurchaseItem],
        transaction,
      });
      if (!purchase) throw Object.assign(new Error('Purchase not found'), { status: 404 });
    }

    const supplierId = Number(data.supplierId || purchase?.supplierId);
    const supplier = await Supplier.findOne({ where: { id: supplierId, detstatus: false }, transaction });
    if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });

    const products = await Product.findAll({ where: { id: items.map((i) => i.productId) }, transaction });
    const byId = new Map(products.map((p) => [p.id, p]));
    const purchasedById = new Map((purchase?.PurchaseItems || []).map((i) => [i.id, i]));

    const lines = items.map((item) => {
      const product = byId.get(Number(item.productId));
      if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });

      const quantity = Number(item.quantity);
      if (!(quantity > 0)) {
        throw Object.assign(new Error(`Return quantity for ${product.productName} must be greater than zero`), { status: 400 });
      }

      // A return against a purchase cannot exceed what was bought on it.
      const source = item.purchaseItemId ? purchasedById.get(Number(item.purchaseItemId)) : null;
      if (source && quantity > Number(source.quantity) + 0.001) {
        throw Object.assign(
          new Error(`${product.productName}: cannot return ${quantity} when only ${source.quantity} was purchased`),
          { status: 400 },
        );
      }

      const rate = Number(item.rate ?? source?.rate ?? product.purchasePrice ?? 0);
      const gstPercent = Number(item.gstPercent ?? source?.gstPercent ?? product.gstPercent ?? 0);
      const taxable = quantity * rate;
      const gstAmount = taxable * gstPercent / 100;

      return {
        productId: product.id,
        purchaseItemId: source?.id || null,
        batchId: item.batchId || null,
        batchNumber: item.batchNumber || source?.batchNumber || null,
        quantity,
        rate,
        gstPercent,
        gstAmount,
        amount: taxable + gstAmount,
        // Returned in whatever unit it was bought in, converted the same way.
        ...unitSnapshot(product, item.um || source?.um, quantity),
        reason: item.reason || null,
        authadd: req.user.id,
      };
    });

    const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.rate, 0);
    const taxAmount = lines.reduce((sum, l) => sum + l.gstAmount, 0);

    const purchaseReturn = await PurchaseReturn.create({
      returnNumber: data.returnNumber || await nextNumber(transaction),
      returnDate: data.returnDate || new Date().toISOString().slice(0, 10),
      purchaseId: purchase?.id || null,
      supplierId,
      branchId: Number(data.branchId || purchase?.branchId || req.branchId),
      status: 'Draft',
      subtotal,
      taxAmount,
      grandTotal: subtotal + taxAmount,
      reason: data.reason || null,
      createdBy: req.user.id,
      notes: data.notes || null,
      authadd: req.user.id,
    }, { transaction });

    await PurchaseReturnItem.bulkCreate(
      lines.map((line) => ({ ...line, returnId: purchaseReturn.id })),
      { transaction },
    );

    return purchaseReturn;
  });

  res.status(201).json(await PurchaseReturn.findByPk(created.id, { include: [ITEM_INCLUDE] }));
});

/** Confirming is what moves stock out and raises the debit note. */
export const confirm = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const purchaseReturn = await PurchaseReturn.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [PurchaseReturnItem],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!purchaseReturn) throw Object.assign(new Error('Purchase return not found'), { status: 404 });
    if (purchaseReturn.status !== 'Draft') {
      throw Object.assign(new Error(`A ${purchaseReturn.status.toLowerCase()} return cannot be confirmed`), { status: 409 });
    }

    // We cannot send back what is not on the shelf.
    await assertAvailable(
      purchaseReturn.PurchaseReturnItems.map((item) => ({
        productId: item.productId,
        quantity: Number(item.primaryQty || item.quantity),
      })),
      purchaseReturn.branchId,
      transaction,
    );

    for (const item of purchaseReturn.PurchaseReturnItems) {
      const quantity = Number(item.primaryQty || item.quantity);

      await postStockTransaction({
        productId: item.productId,
        branchId: purchaseReturn.branchId,
        quantity: -quantity,
        movementType: 'Purchase Return',
        referenceType: 'Purchase Return',
        referenceId: purchaseReturn.id,
        referenceNumber: purchaseReturn.returnNumber,
        batchId: item.batchId,
        unitCost: item.rate,
        transactionDate: purchaseReturn.returnDate,
        notes: `Returned to supplier on ${purchaseReturn.returnNumber}`,
        transaction,
        userId: req.user.id,
      });

      // The lot the goods came from shrinks with them.
      if (item.batchNumber) {
        const batch = await ProductBatch.findOne({
          where: {
            productId: item.productId,
            branchId: purchaseReturn.branchId,
            batchNumber: item.batchNumber,
            detstatus: false,
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (batch) {
          await batch.update({
            quantity: Math.max(0, Number(batch.quantity) - quantity),
            authlstedit: req.user.id,
          }, { transaction });
        }
      }
    }

    await purchaseReturn.update({
      status: 'Confirmed',
      debitNoteNumber: purchaseReturn.debitNoteNumber || purchaseReturn.returnNumber.replace('PR-', 'DN-'),
      authlstedit: req.user.id,
    }, { transaction });

    await postPurchaseReturn({ purchaseReturn, transaction, userId: req.user.id });
    return purchaseReturn;
  });

  res.json(await PurchaseReturn.findByPk(result.id, { include: [ITEM_INCLUDE] }));
});

export const cancel = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const purchaseReturn = await PurchaseReturn.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [PurchaseReturnItem],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!purchaseReturn) throw Object.assign(new Error('Purchase return not found'), { status: 404 });
    if (purchaseReturn.status === 'Cancelled') {
      throw Object.assign(new Error('This return is already cancelled'), { status: 409 });
    }

    // A confirmed return already moved stock and money, so both come back.
    if (purchaseReturn.status === 'Confirmed') {
      for (const item of purchaseReturn.PurchaseReturnItems) {
        await postStockTransaction({
          productId: item.productId,
          branchId: purchaseReturn.branchId,
          quantity: Number(item.primaryQty || item.quantity),
          movementType: 'Adjustment In',
          referenceType: 'Purchase Return Cancellation',
          referenceId: purchaseReturn.id,
          referenceNumber: purchaseReturn.returnNumber,
          batchId: item.batchId,
          unitCost: item.rate,
          notes: `Reversed via cancelled return ${purchaseReturn.returnNumber}`,
          transaction,
          userId: req.user.id,
        });
      }

      const entry = await JournalEntry.findOne({
        where: { sourceType: 'PurchaseReturn', sourceId: purchaseReturn.id, status: 'Posted', detstatus: false },
        transaction,
      });
      if (entry) {
        await reverseEntry({
          entryId: entry.id,
          userId: req.user.id,
          transaction,
          narration: `Cancellation of purchase return ${purchaseReturn.returnNumber}`,
        });
      }
    }

    // Cancelled, not deleted: a return that was made and then reversed is part
    // of the record, and the supplier ledger still shows both movements.
    await purchaseReturn.update({
      status: 'Cancelled',
      authlstedit: req.user.id,
    }, { transaction });
  });

  res.json({ message: 'Purchase return cancelled and stock restored' });
});

/** Lines from a purchase that are still available to return. */
export const returnableItems = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findOne({
    where: { id: req.params.purchaseId, detstatus: false },
    include: [Supplier, { model: PurchaseItem, include: Product }],
  });
  if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

  const returned = await PurchaseReturnItem.findAll({
    where: { detstatus: false },
    include: [{
      model: PurchaseReturn,
      where: { purchaseId: purchase.id, status: 'Confirmed', detstatus: false },
      attributes: [],
      required: true,
    }],
    attributes: ['purchaseItemId', 'quantity'],
    raw: true,
  });

  const returnedByItem = returned.reduce((map, row) => {
    const key = Number(row.purchaseItemId);
    map.set(key, (map.get(key) || 0) + Number(row.quantity));
    return map;
  }, new Map());

  res.json({
    id: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    purchaseDate: purchase.purchaseDate,
    supplierId: purchase.supplierId,
    supplier: purchase.Supplier,
    branchId: purchase.branchId,
    items: purchase.PurchaseItems.map((item) => {
      const alreadyReturned = returnedByItem.get(item.id) || 0;
      return {
        purchaseItemId: item.id,
        productId: item.productId,
        product: item.Product,
        purchasedQty: Number(item.quantity),
        returnedQty: alreadyReturned,
        returnableQty: Number(item.quantity) - alreadyReturned,
        rate: Number(item.rate),
        gstPercent: Number(item.gstPercent),
        um: item.um,
        batchNumber: item.batchNumber,
      };
    }).filter((item) => item.returnableQty > 0),
  });
});
