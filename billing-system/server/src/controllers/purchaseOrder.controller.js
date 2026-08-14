import { Op } from 'sequelize';
import {
  Branch, Grn, Product, PurchaseOrder, PurchaseOrderItem, sequelize, Supplier, User,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { withDateRange } from '../utils/dateRange.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { cancelFor, requestApproval } from '../services/approval.service.js';

/**
 * Purchase orders.
 *
 * A PO is a commitment to buy, not a receipt of goods: nothing here touches
 * stock. Deliveries arrive through GRNs, and the order stays open until the
 * quantities they bring add up to what was ordered — which is what lets a
 * supplier send 90 of 100 without the order quietly closing at 90.
 */

const ITEM_INCLUDE = {
  model: PurchaseOrderItem,
  include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'secondaryUnit', 'unitConversionFactor', 'purchasePrice', 'gstPercent'] }],
};

async function nextNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await PurchaseOrder.count({
    where: { poNumber: { [Op.like]: `PORD-${year}-%` } },
    transaction,
  });
  return `PORD-${year}-${String(count + 1).padStart(5, '0')}`;
}

/** Works out each line's money and the order's totals. */
function priceItems(items, byId) {
  const lines = items.map((item) => {
    const product = byId.get(Number(item.productId));
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate ?? product?.purchasePrice ?? 0);
    const discount = Number(item.discount || 0);
    const gstPercent = Number(item.gstPercent ?? product?.gstPercent ?? 0);
    const taxable = Math.max(quantity * rate - discount, 0);
    const gstAmount = taxable * gstPercent / 100;

    return {
      productId: Number(item.productId),
      quantity,
      rate,
      discount,
      gstPercent,
      gstAmount,
      amount: taxable + gstAmount,
      um: item.um || product?.primaryUnit || null,
      primaryUnit: product?.primaryUnit || null,
      unitConversionFactor: Number(product?.unitConversionFactor || 1),
      remarks: item.remarks || null,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + Math.max(l.quantity * l.rate - l.discount, 0), 0);
  const taxAmount = lines.reduce((sum, l) => sum + l.gstAmount, 0);
  return { lines, subtotal, taxAmount, grandTotal: subtotal + taxAmount };
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'poDate');
  if (req.query.status) where.status = req.query.status;
  if (req.query.supplierId) where.supplierId = req.query.supplierId;
  // "Still owed to us" — the list purchasing actually works from.
  if (req.query.pending === 'true') {
    where.status = { [Op.in]: ['Approved', 'Partially Received'] };
  }

  const { rows, count } = await PurchaseOrder.findAndCountAll({
    where,
    distinct: true,
    include: [
      Supplier,
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
      ITEM_INCLUDE,
    ],
    limit,
    offset,
    order: [['poDate', 'DESC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      Supplier,
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
      { model: User, as: 'creator', attributes: ['id', 'name'] },
      { model: Grn, attributes: ['id', 'grnNumber', 'grnDate', 'status'] },
      ITEM_INCLUDE,
    ],
  });
  if (!order) return res.status(404).json({ message: 'Purchase order not found' });
  res.json(order);
});

export const create = asyncHandler(async (req, res) => {
  const { items = [], ...data } = req.body;
  if (!items.length) return res.status(400).json({ message: 'Add at least one product to the order' });

  const created = await sequelize.transaction(async (transaction) => {
    const supplier = await Supplier.findOne({ where: { id: data.supplierId, detstatus: false }, transaction });
    if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });

    const products = await Product.findAll({ where: { id: items.map((i) => i.productId) }, transaction });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const item of items) {
      if (!byId.has(Number(item.productId))) {
        throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });
      }
    }

    const totals = priceItems(items, byId);
    const branchId = Number(data.branchId || req.branchId);

    const order = await PurchaseOrder.create({
      poNumber: data.poNumber || await nextNumber(transaction),
      poDate: data.poDate || new Date().toISOString().slice(0, 10),
      expectedDate: data.expectedDate || null,
      supplierId: supplier.id,
      branchId,
      status: 'Draft',
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      grandTotal: totals.grandTotal,
      createdBy: req.user.id,
      terms: data.terms || null,
      notes: data.notes || null,
      authadd: req.user.id,
    }, { transaction });

    await PurchaseOrderItem.bulkCreate(
      totals.lines.map((line) => ({ ...line, poId: order.id, authadd: req.user.id })),
      { transaction },
    );

    return order;
  });

  res.status(201).json(await PurchaseOrder.findByPk(created.id, { include: [ITEM_INCLUDE] }));
});

export const update = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;

  const result = await sequelize.transaction(async (transaction) => {
    const order = await PurchaseOrder.findOne({
      where: { id: req.params.id, detstatus: false }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw Object.assign(new Error('Purchase order not found'), { status: 404 });
    // Once goods have started arriving, the order is a record of what was
    // agreed — editing it would rewrite what the supplier was asked for.
    if (!['Draft', 'Pending Approval', 'Rejected'].includes(order.status)) {
      throw Object.assign(new Error(`A ${order.status.toLowerCase()} order cannot be edited`), { status: 409 });
    }

    if (Array.isArray(items) && items.length) {
      const products = await Product.findAll({ where: { id: items.map((i) => i.productId) }, transaction });
      const byId = new Map(products.map((p) => [p.id, p]));
      const totals = priceItems(items, byId);

      await PurchaseOrderItem.destroy({ where: { poId: order.id }, transaction });
      await PurchaseOrderItem.bulkCreate(
        totals.lines.map((line) => ({ ...line, poId: order.id, authadd: req.user.id })),
        { transaction },
      );
      Object.assign(data, {
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        grandTotal: totals.grandTotal,
      });
    }

    await order.update({ ...data, authlstedit: req.user.id }, { transaction });
    return order;
  });

  res.json(await PurchaseOrder.findByPk(result.id, { include: [ITEM_INCLUDE] }));
});

/** Sends the order for approval, or approves it outright when no rule applies. */
export const submit = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const order = await PurchaseOrder.findOne({
      where: { id: req.params.id, detstatus: false }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw Object.assign(new Error('Purchase order not found'), { status: 404 });
    if (!['Draft', 'Rejected'].includes(order.status)) {
      throw Object.assign(new Error(`A ${order.status.toLowerCase()} order cannot be submitted`), { status: 409 });
    }

    const request = await requestApproval({
      documentType: 'PurchaseOrder',
      documentId: order.id,
      documentNumber: order.poNumber,
      values: { grandTotal: Number(order.grandTotal), amount: Number(order.grandTotal) },
      branchId: order.branchId,
      userId: req.user.id,
      transaction,
    });

    // No rule matched, so there is nobody to wait for.
    await order.update({
      status: request ? 'Pending Approval' : 'Approved',
      approvedBy: request ? null : req.user.id,
      approvedAt: request ? null : new Date(),
      authlstedit: req.user.id,
    }, { transaction });

    return order;
  });
  res.json(result);
});

export const approve = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const order = await PurchaseOrder.findOne({
      where: { id: req.params.id, detstatus: false }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw Object.assign(new Error('Purchase order not found'), { status: 404 });
    if (!['Draft', 'Pending Approval'].includes(order.status)) {
      throw Object.assign(new Error(`A ${order.status.toLowerCase()} order cannot be approved`), { status: 409 });
    }

    await order.update({
      status: 'Approved',
      approvedBy: req.user.id,
      approvedAt: new Date(),
      authlstedit: req.user.id,
    }, { transaction });
    return order;
  });
  res.json(result);
});

export const reject = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const order = await PurchaseOrder.findOne({
      where: { id: req.params.id, detstatus: false }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw Object.assign(new Error('Purchase order not found'), { status: 404 });

    await cancelFor({ documentType: 'PurchaseOrder', documentId: order.id, userId: req.user.id, transaction });
    await order.update({
      status: 'Rejected',
      rejectionReason: req.body.reason || null,
      authlstedit: req.user.id,
    }, { transaction });
    return order;
  });
  res.json(result);
});

export const cancel = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!order) return res.status(404).json({ message: 'Purchase order not found' });
  if (['Received', 'Closed'].includes(order.status)) {
    return res.status(409).json({ message: `A ${order.status.toLowerCase()} order cannot be cancelled` });
  }

  const received = await PurchaseOrderItem.sum('receivedQty', { where: { poId: order.id } });
  if (Number(received || 0) > 0) {
    return res.status(409).json({
      message: 'Goods have already been received against this order. Close it instead of cancelling.',
    });
  }

  await order.update({ status: 'Cancelled', authlstedit: req.user.id });
  res.json(order);
});

/** Closes an order short — the balance is not coming, and that is a decision. */
export const close = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!order) return res.status(404).json({ message: 'Purchase order not found' });
  await order.update({
    status: 'Closed',
    notes: req.body.reason ? `${order.notes || ''}\nClosed: ${req.body.reason}`.trim() : order.notes,
    authlstedit: req.user.id,
  });
  res.json(order);
});

/** Lines still outstanding on an order, used to prefill a GRN. */
export const pendingItems = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [Supplier, ITEM_INCLUDE],
  });
  if (!order) return res.status(404).json({ message: 'Purchase order not found' });

  res.json({
    id: order.id,
    poNumber: order.poNumber,
    supplierId: order.supplierId,
    supplier: order.Supplier,
    branchId: order.branchId,
    items: order.PurchaseOrderItems
      .map((item) => ({
        poItemId: item.id,
        productId: item.productId,
        product: item.Product,
        orderedQty: Number(item.quantity),
        receivedQty: Number(item.receivedQty),
        pendingQty: Number(item.quantity) - Number(item.receivedQty),
        rate: Number(item.rate),
        gstPercent: Number(item.gstPercent),
        um: item.um,
      }))
      .filter((item) => item.pendingQty > 0),
  });
});
