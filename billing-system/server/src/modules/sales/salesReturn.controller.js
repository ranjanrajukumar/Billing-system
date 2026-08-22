import { Op } from 'sequelize';
import { SalesReturn, SalesReturnItem, Customer, Product, User } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { paged } from '../../utils/pagination.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { withDateRange } from '../../utils/dateRange.js';
import { sequelize } from '../../models/index.js';
import { documentOutputHandlers } from '../platform/documentOutput.js';
import { postStockTransaction } from '../inventory/stock.service.js';
import { restoreFromItems } from '../inventory/batch.service.js';
import { Invoice, InvoiceItem } from '../../models/index.js';

// The client posts items as quantity/rate; the model stores a refund amount.
function normalizeReturnItems(items = []) {
  return items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const refundAmount = item.refundAmount !== undefined
      ? Number(item.refundAmount)
      : quantity * Number(item.rate || 0);
    return {
      productId: item.productId,
      // Carried through explicitly: this normaliser is the only thing between
      // the request and the stock movement, so a field it drops is a field the
      // ledger never sees. A returned pack credited to loose stock is invisible
      // until somebody counts the shelf.
      variantId: Number(item.variantId) || 0,
      quantity,
      refundAmount,
      batchId: item.batchId || null,
    };
  });
}

const refundTotal = (items) => normalizeReturnItems(items).reduce((sum, item) => sum + item.refundAmount, 0);

export const getAll = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  // In multi-branch mode a user only sees their own branch's records.
  let where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'returnDate');
  if (search) {
    where['returnNumber'] = { [Op.like]: `%${search}%` };
  }

  const { rows, count } = await SalesReturn.findAndCountAll({
    where,
    include: [
      { model: Customer, attributes: ['customerName', 'mobileNumber'] },
      { model: User, as: 'creator', attributes: ['name'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['addondt', 'DESC']]
  });

  res.json(paged(rows, count, Number(page), Number(limit)));
});

export const getOne = asyncHandler(async (req, res) => {
  const item = await SalesReturn.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: Customer },
      { model: SalesReturnItem, include: [Product] }
    ]
  });
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
});

async function nextReturnNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await SalesReturn.count({ where: { returnNumber: { [Op.like]: `SR-${year}-%` } }, transaction });
  return `SR-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const create = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;
  data.authadd = req.user.id;
  // The list is filtered by branch, so a record saved without one would be
  // invisible the moment it was created.
  data.branchId = data.branchId || req.branchId;

  const result = await sequelize.transaction(async (t) => {
    if (!data.returnNumber) {
      data.returnNumber = await nextReturnNumber(t);
    }
    if (!data.returnDate) {
      data.returnDate = new Date().toISOString().slice(0, 10);
    }
    if (!data.totalRefund && items && items.length > 0) {
      data.totalRefund = refundTotal(items);
    }

    if (data.invoiceId && items && items.length > 0) {
      const invoice = await Invoice.findOne({ where: { id: data.invoiceId, detstatus: false }, include: [InvoiceItem], transaction: t });
      if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
      
      const invoiceQuantities = {};
      invoice.InvoiceItems.forEach(i => {
        invoiceQuantities[i.productId] = (invoiceQuantities[i.productId] || 0) + Number(i.quantity);
      });
      
      const pastReturns = await SalesReturnItem.findAll({
        include: [{ model: SalesReturn, where: { invoiceId: data.invoiceId, detstatus: false } }],
        transaction: t
      });
      pastReturns.forEach(i => {
        invoiceQuantities[i.productId] -= Number(i.quantity);
      });

      for (const item of normalizeReturnItems(items)) {
        const available = invoiceQuantities[item.productId] || 0;
        if (item.quantity > available) {
          throw Object.assign(new Error(`Return quantity for product ${item.productId} exceeds the original invoiced amount (max allowed: ${available})`), { status: 400 });
        }
      }
    }

    const parent = await SalesReturn.create(data, { transaction: t });
    if (items && items.length > 0) {
      const itemsData = normalizeReturnItems(items).map(item => ({ ...item, returnId: parent.id, authadd: req.user.id }));
      const createdItems = await SalesReturnItem.bulkCreate(itemsData, { transaction: t, returning: true });

      const { QcInspection } = await import('../../models/index.js');
      const count = await QcInspection.count({ transaction: t });
      let index = 1;

      for (const item of createdItems) {
        await QcInspection.create({
          inspectionNumber: `QC-${String(count + index).padStart(5, '0')}-RET-${item.id}`,
          returnId: parent.id,
          returnItemId: item.id,
          productId: item.productId,
          inspectedQty: Number(item.quantity),
          status: 'Pending',
          authadd: req.user.id,
        }, { transaction: t });
        index++;
      }
    }
    return parent;
  });

  res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;
  data.authlstedit = req.user.id;
  data.editondt = new Date();

  await sequelize.transaction(async (t) => {
    const existing = await SalesReturn.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [SalesReturnItem],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!existing) throw Object.assign(new Error('Sales return not found'), { status: 404 });

    // Reverse old stock entries
    for (const item of existing.SalesReturnItems) {
      await postStockTransaction({
        productId: item.productId,
        // The balance this line refers to: 0 loose, otherwise a pack.
        variantId: item.variantId || 0,
        branchId: existing.branchId || req.branchId,
        quantity: -Number(item.quantity),
        movementType: 'Adjustment Out',
        referenceType: 'Sales Return Edit Reversal',
        referenceId: existing.id,
        referenceNumber: existing.returnNumber,
        batchId: item.batchId || null, // although we didn't save batchId in SalesReturnItem, handle it if added later
        notes: `Reversed before editing Sales Return ${existing.returnNumber}`,
        transaction: t,
        userId: req.user.id,
        allowNegative: true, // We are reversing an inward move
      });
      // Reverse batch quantity
      if (item.batchId) {
        await restoreFromItems([{ ...item, quantity: -Number(item.quantity) }], { transaction: t, userId: req.user.id });
      }
    }

    await SalesReturn.update(data, { where: { id: req.params.id }, transaction: t });

    if (items) {
      await SalesReturnItem.destroy({ where: { returnId: req.params.id }, transaction: t });
      const itemsData = normalizeReturnItems(items).map(item => ({ ...item, returnId: req.params.id, authadd: req.user.id }));
      await SalesReturnItem.bulkCreate(itemsData, { transaction: t });

      // Apply new stock entries
      for (const item of itemsData) {
        await postStockTransaction({
          productId: item.productId,
          // The balance this line refers to: 0 loose, otherwise a pack.
          variantId: item.variantId || 0,
          branchId: existing.branchId || req.branchId,
          quantity: Number(item.quantity),
          movementType: 'Sale Return',
          referenceType: 'Sales Return Edit',
          referenceId: existing.id,
          referenceNumber: existing.returnNumber,
          transactionDate: existing.returnDate,
          batchId: item.batchId || null,
          notes: `Re-applied via Edited Sales Return ${existing.returnNumber}`,
          transaction: t,
          userId: req.user.id,
        });
      }
      await restoreFromItems(itemsData, { transaction: t, userId: req.user.id });
    }
  });

  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (t) => {
    const existing = await SalesReturn.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [SalesReturnItem],
      transaction: t,
    });
    if (!existing) throw Object.assign(new Error('Sales return not found'), { status: 404 });

    // Completely reverse stock entries
    for (const item of existing.SalesReturnItems) {
      await postStockTransaction({
        productId: item.productId,
        // The balance this line refers to: 0 loose, otherwise a pack.
        variantId: item.variantId || 0,
        branchId: existing.branchId || req.branchId,
        quantity: -Number(item.quantity),
        movementType: 'Adjustment Out',
        referenceType: 'Sales Return Cancellation',
        referenceId: existing.id,
        referenceNumber: existing.returnNumber,
        batchId: item.batchId || null,
        notes: `Reversed via Cancelled Sales Return ${existing.returnNumber}`,
        transaction: t,
        userId: req.user.id,
        allowNegative: true,
      });
      if (item.batchId) {
        await restoreFromItems([{ ...item, quantity: -Number(item.quantity) }], { transaction: t, userId: req.user.id });
      }
    }

    await SalesReturn.update(
      { detstatus: true, authdel: req.user.id, delondt: new Date(), status: 'Rejected' },
      { where: { id: req.params.id }, transaction: t }
    );
  });
  res.json({ message: 'Deleted successfully' });
});

const loadReturn = (req) => SalesReturn.findOne({
  where: { id: req.params.id, detstatus: false },
  include: [{ model: Customer }, { model: SalesReturnItem, include: [Product] }]
});

export const { downloadPdf, html } = documentOutputHandlers('salesReturn', loadReturn);
