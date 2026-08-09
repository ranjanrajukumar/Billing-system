import { Op } from 'sequelize';
import { sequelize, Product, Purchase, PurchaseItem, StockMovement, Supplier } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { withDateRange } from '../utils/dateRange.js';
import { getPagination, paged } from '../utils/pagination.js';
import { adjustStock, assertAvailable } from '../services/stock.service.js';

async function nextPurchaseNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await Purchase.count({ where: { purchaseNumber: { [Op.like]: `PO-${year}-%` } }, transaction });
  return `PO-${year}-${String(count + 1).padStart(5, '0')}`;
}

function calculateItems(items) {
  const calculated = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const gstPercent = Number(item.gstPercent || 0);
    const taxable = quantity * rate;
    const gstAmount = taxable * gstPercent / 100;
    return { ...item, quantity, rate, gstPercent, gstAmount, amount: taxable + gstAmount };
  });
  const subtotal = calculated.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const taxAmount = calculated.reduce((sum, item) => sum + item.gstAmount, 0);
  return { items: calculated, subtotal, taxAmount, grandTotal: subtotal + taxAmount };
}

export const listPurchases = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  // In multi-branch mode a user only sees their own branch's records.
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'purchaseDate');
  const { rows, count } = await Purchase.findAndCountAll({
    where,
    include: [Supplier, { model: PurchaseItem, include: Product }],
    limit,
    offset,
    order: [['purchaseDate', 'DESC'], ['id', 'DESC']]
  });
  res.json(paged(rows, count, page, limit));
});

export const getPurchase = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findOne({ where: { id: req.params.id, detstatus: false }, include: [Supplier, { model: PurchaseItem, include: Product }] });
  if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
  res.json(purchase);
});

export const createPurchase = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const supplier = await Supplier.findOne({ where: { id: req.body.supplierId, detstatus: false }, transaction });
    if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });

    const productIds = req.body.items.map((item) => item.productId);
    const products = await Product.findAll({ where: { id: productIds }, transaction, lock: transaction.LOCK.UPDATE });
    const byId = new Map(products.map((p) => [p.id, p]));
    req.body.items.forEach((item) => {
      if (!byId.has(Number(item.productId))) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });
    });

    const totals = calculateItems(req.body.items);
    const purchase = await Purchase.create({
      purchaseNumber: req.body.purchaseNumber || await nextPurchaseNumber(transaction),
      purchaseDate: req.body.purchaseDate,
      branchId: req.branchId,
      supplierId: supplier.id,
      createdBy: req.user.id,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      grandTotal: totals.grandTotal,
      paidAmount: req.body.paidAmount || 0,
      paymentStatus: Number(req.body.paidAmount || 0) >= totals.grandTotal ? 'Paid' : Number(req.body.paidAmount || 0) > 0 ? 'Partially Paid' : 'Unpaid',
      status: req.body.status || 'Received',
      notes: req.body.notes
    }, { transaction });

    await PurchaseItem.bulkCreate(totals.items.map((item) => ({
      purchaseId: purchase.id,
      productId: item.productId,
      quantity: item.quantity,
      rate: item.rate,
      gstPercent: item.gstPercent,
      gstAmount: item.gstAmount,
      amount: item.amount
    })), { transaction });

    if (purchase.status === 'Received') {
      for (const item of totals.items) {
        await adjustStock({
          productId: item.productId,
          branchId: req.branchId,
          delta: Number(item.quantity),
          transaction,
          userId: req.user.id,
        });
      }
      await StockMovement.bulkCreate(totals.items.map((item) => ({
        productId: item.productId,
        createdBy: req.user.id,
        movementType: 'Purchase',
        quantity: item.quantity,
        referenceType: 'Purchase',
        referenceId: purchase.id,
        notes: purchase.purchaseNumber
      })), { transaction });
    }

    return purchase;
  });

  const purchase = await Purchase.findOne({ where: { id: created.id}, include: [Supplier, { model: PurchaseItem, include: Product }] });
  res.status(201).json(purchase);
});

export const removePurchase = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const purchase = await Purchase.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [PurchaseItem],
      transaction
    });
    if (!purchase) throw Object.assign(new Error('Purchase not found'), { status: 404 });

    // Only received stock was added, so only received stock comes back out.
    if (purchase.status === 'Received') {
      const branchId = purchase.branchId || req.branchId;
      // Refuses rather than driving the branch negative if the goods were sold on.
      await assertAvailable(purchase.PurchaseItems, branchId, transaction);
      for (const item of purchase.PurchaseItems) {
        await adjustStock({
          productId: item.productId,
          branchId,
          delta: -Number(item.quantity),
          transaction,
          userId: req.user.id,
        });
      }

      await StockMovement.bulkCreate(purchase.PurchaseItems.map((item) => ({
        productId: item.productId,
        createdBy: req.user.id,
        movementType: 'Adjustment Out',
        quantity: -item.quantity,
        referenceType: 'Purchase Cancellation',
        referenceId: purchase.id,
        notes: `Reversed via cancelled purchase ${purchase.purchaseNumber}`,
        authadd: req.user.id
      })), { transaction });
    }

    await purchase.update({
      detstatus: true,
      status: 'Cancelled',
      authdel: req.user.id,
      delondt: new Date()
    }, { transaction });
  });

  res.json({ message: 'Purchase cancelled and stock reversed' });
});
