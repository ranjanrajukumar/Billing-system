import { Op } from 'sequelize';
import {
  Branch, Grn, GrnItem, Product, ProductBatch, ProductSerial, Purchase, PurchaseItem,
  PurchaseOrder, PurchaseOrderItem, sequelize, Supplier, User,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { withDateRange } from '../utils/dateRange.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { postStockTransaction } from '../services/stock.service.js';
import { postPurchase } from '../services/accounting.service.js';
import { primaryQtyFromLine, resolveUnits } from '../utils/units.js';

/**
 * Goods Receipt Note.
 *
 * The central rule: only the *accepted* quantity becomes stock. What arrived,
 * what was rejected on inspection and what turned up damaged are recorded
 * separately, because a supplier who repeatedly sends broken goods is a fact
 * the business needs, and netting it away hides it.
 *
 * Posting is one-way. A GRN that has been posted has moved real inventory, so
 * it is corrected with a purchase return rather than by editing history.
 */

const ITEM_INCLUDE = {
  model: GrnItem,
  include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'unitConversionFactor', 'batchRequired', 'expiryRequired', 'serialRequired'] }],
};

async function nextNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await Grn.count({ where: { grnNumber: { [Op.like]: `GRN-${year}-%` } }, transaction });
  return `GRN-${year}-${String(count + 1).padStart(5, '0')}`;
}

async function nextPurchaseNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await Purchase.count({
    where: { purchaseNumber: { [Op.like]: `PO-${year}-%` } },
    transaction,
  });
  return `PO-${year}-${String(count + 1).padStart(5, '0')}`;
}

/** Splits a line into its accepted / rejected / damaged parts, defaulting sanely. */
function resolveQuantities(item) {
  const received = Number(item.receivedQty || 0);
  const rejected = Number(item.rejectedQty || 0);
  const damaged = Number(item.damagedQty || 0);
  // Nothing said about rejects means it was all fit to sell.
  const accepted = item.acceptedQty !== undefined && item.acceptedQty !== null && item.acceptedQty !== ''
    ? Number(item.acceptedQty)
    : received - rejected - damaged;

  if (accepted < 0) {
    throw Object.assign(new Error('Rejected and damaged quantities exceed what was received'), { status: 400 });
  }
  if (accepted + rejected + damaged > received + 0.001) {
    throw Object.assign(
      new Error(`Accepted (${accepted}) + rejected (${rejected}) + damaged (${damaged}) is more than received (${received})`),
      { status: 400 },
    );
  }
  return { received, accepted, rejected, damaged };
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'grnDate');
  if (req.query.status) where.status = req.query.status;
  if (req.query.supplierId) where.supplierId = req.query.supplierId;
  if (req.query.poId) where.poId = req.query.poId;

  const { rows, count } = await Grn.findAndCountAll({
    where,
    distinct: true,
    include: [
      Supplier,
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
      { model: PurchaseOrder, attributes: ['id', 'poNumber'] },
      ITEM_INCLUDE,
    ],
    limit,
    offset,
    order: [['grnDate', 'DESC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const grn = await Grn.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      Supplier,
      { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
      { model: PurchaseOrder, attributes: ['id', 'poNumber', 'poDate'] },
      { model: User, as: 'receiver', attributes: ['id', 'name'] },
      ITEM_INCLUDE,
    ],
  });
  if (!grn) return res.status(404).json({ message: 'GRN not found' });
  res.json(grn);
});

export const create = asyncHandler(async (req, res) => {
  const { items = [], ...data } = req.body;
  if (!items.length) return res.status(400).json({ message: 'Add at least one received line' });

  const created = await sequelize.transaction(async (transaction) => {
    let order = null;
    if (data.poId) {
      order = await PurchaseOrder.findOne({
        where: { id: data.poId, detstatus: false },
        include: [PurchaseOrderItem],
        transaction,
      });
      if (!order) throw Object.assign(new Error('Purchase order not found'), { status: 404 });
      if (!['Approved', 'Partially Received'].includes(order.status)) {
        throw Object.assign(
          new Error(`Goods cannot be received against a ${order.status.toLowerCase()} order`),
          { status: 409 },
        );
      }
    }

    const supplierId = Number(data.supplierId || order?.supplierId);
    const supplier = await Supplier.findOne({ where: { id: supplierId, detstatus: false }, transaction });
    if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });

    const products = await Product.findAll({ where: { id: items.map((i) => i.productId) }, transaction });
    const byId = new Map(products.map((p) => [p.id, p]));
    const poItemsById = new Map((order?.PurchaseOrderItems || []).map((i) => [i.id, i]));

    const grn = await Grn.create({
      grnNumber: data.grnNumber || await nextNumber(transaction),
      grnDate: data.grnDate || new Date().toISOString().slice(0, 10),
      poId: order?.id || null,
      supplierId,
      branchId: Number(data.branchId || order?.branchId || req.branchId),
      status: 'Draft',
      supplierInvoiceNo: data.supplierInvoiceNo || null,
      supplierInvoiceDate: data.supplierInvoiceDate || null,
      transporter: data.transporter || null,
      vehicleNo: data.vehicleNo || null,
      lrNumber: data.lrNumber || null,
      receivedBy: req.user.id,
      remarks: data.remarks || null,
      authadd: req.user.id,
    }, { transaction });

    const lines = items.map((item) => {
      const product = byId.get(Number(item.productId));
      if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });

      const poItem = item.poItemId ? poItemsById.get(Number(item.poItemId)) : null;
      const { received, accepted, rejected, damaged } = resolveQuantities(item);
      const units = resolveUnits(product, item.um || poItem?.um);

      // Over-delivery is refused rather than absorbed: goods nobody ordered
      // should be a conversation with the supplier, not a silent stock increase.
      if (poItem) {
        const outstanding = Number(poItem.quantity) - Number(poItem.receivedQty);
        if (received > outstanding + 0.001) {
          throw Object.assign(
            new Error(`${product.productName}: receiving ${received} exceeds the ${outstanding} still outstanding on the order`),
            { status: 400 },
          );
        }
      }

      return {
        grnId: grn.id,
        poItemId: poItem?.id || null,
        productId: product.id,
        orderedQty: poItem ? Number(poItem.quantity) : Number(item.orderedQty || received),
        receivedQty: received,
        acceptedQty: accepted,
        rejectedQty: rejected,
        damagedQty: damaged,
        rate: Number(item.rate ?? poItem?.rate ?? product.purchasePrice ?? 0),
        gstPercent: Number(item.gstPercent ?? poItem?.gstPercent ?? product.gstPercent ?? 0),
        um: units.billedUnit,
        primaryUnit: units.primaryUnit,
        unitConversionFactor: units.factor,
        batchNumber: item.batchNumber || null,
        manufacturingDate: item.manufacturingDate || null,
        expiryDate: item.expiryDate || null,
        germinationPercent: item.germinationPercent || null,
        serialNumbers: item.serialNumbers || null,
        rejectionReason: item.rejectionReason || null,
        remarks: item.remarks || null,
        authadd: req.user.id,
      };
    });

    await GrnItem.bulkCreate(lines, { transaction });
    return grn;
  });

  res.status(201).json(await Grn.findByPk(created.id, { include: [ITEM_INCLUDE] }));
});

/**
 * Posts the receipt: accepted quantities become stock, batches and serials are
 * created, and the order's received figures move on.
 */
export const post = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const grn = await Grn.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [GrnItem, Supplier],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
    if (grn.postedAt) throw Object.assign(new Error('This GRN has already been posted to stock'), { status: 409 });
    if (grn.status === 'Cancelled') {
      throw Object.assign(new Error('A cancelled GRN cannot be posted'), { status: 409 });
    }

    for (const item of grn.GrnItems) {
      const accepted = Number(item.acceptedQty || 0);
      // Stock is always held in the primary unit. The line's own snapshot is
      // used rather than the product's current units, so posting a receipt
      // keyed last week converts the way it did when it was entered.
      const primaryQty = primaryQtyFromLine(item, accepted);

      if (primaryQty > 0) {
        // A batch is created before the movement so the ledger row can point at it.
        let batch = null;
        if (item.batchNumber?.trim()) {
          const [row] = await ProductBatch.findOrCreate({
            where: {
              productId: item.productId,
              branchId: grn.branchId,
              batchNumber: item.batchNumber.trim(),
              detstatus: false,
            },
            defaults: {
              productId: item.productId,
              branchId: grn.branchId,
              batchNumber: item.batchNumber.trim(),
              lotNumber: item.batchNumber.trim(),
              germinationPercent: item.germinationPercent || null,
              packingDate: item.manufacturingDate || null,
              expiryDate: item.expiryDate || null,
              quantity: 0,
              purchaseRate: item.rate,
              supplierName: grn.Supplier?.supplierName || null,
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });

          await row.update({
            quantity: Number(row.quantity || 0) + primaryQty,
            expiryDate: item.expiryDate || row.expiryDate,
            germinationPercent: item.germinationPercent ?? row.germinationPercent,
            purchaseRate: item.rate,
            authlstedit: req.user.id,
          }, { transaction });

          batch = row;
          await item.update({ batchId: row.id }, { transaction });
        }

        await postStockTransaction({
          productId: item.productId,
          branchId: grn.branchId,
          quantity: primaryQty,
          movementType: 'GRN',
          referenceType: 'GRN',
          referenceId: grn.id,
          referenceNumber: grn.grnNumber,
          batchId: batch?.id || null,
          unitCost: item.rate,
          transactionDate: grn.grnDate,
          notes: `Accepted ${accepted} ${item.um || ''} on ${grn.grnNumber}`.trim(),
          transaction,
          userId: req.user.id,
        });
      }

      // Serials arrive as free text; each becomes a tracked unit.
      if (item.serialNumbers?.trim()) {
        const serials = item.serialNumbers
          .split(/[\s,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);

        for (const serialNumber of serials) {
          const existing = await ProductSerial.findOne({
            where: { serialNumber, productId: item.productId, detstatus: false },
            transaction,
          });
          if (existing) {
            throw Object.assign(
              new Error(`Serial ${serialNumber} is already recorded against this product`),
              { status: 409 },
            );
          }
          await ProductSerial.create({
            productId: item.productId,
            serialNumber,
            branchId: grn.branchId,
            batchId: item.batchId || null,
            status: 'In Stock',
            grnId: grn.id,
            supplierId: grn.supplierId,
            purchaseCost: item.rate,
            authadd: req.user.id,
          }, { transaction });
        }
      }

      // The order's outstanding balance moves by what was received, not by what
      // was accepted — a rejected delivery still used up the supplier's attempt.
      if (item.poItemId) {
        const poItem = await PurchaseOrderItem.findByPk(item.poItemId, { transaction, lock: transaction.LOCK.UPDATE });
        if (poItem) {
          await poItem.update({
            receivedQty: Number(poItem.receivedQty || 0) + Number(item.receivedQty || 0),
            authlstedit: req.user.id,
          }, { transaction });
        }
      }
    }

    // The order closes only when every line is satisfied.
    if (grn.poId) {
      const order = await PurchaseOrder.findOne({
        where: { id: grn.poId }, include: [PurchaseOrderItem], transaction, lock: transaction.LOCK.UPDATE,
      });
      if (order) {
        const complete = order.PurchaseOrderItems.every(
          (item) => Number(item.receivedQty) >= Number(item.quantity) - 0.001,
        );
        const started = order.PurchaseOrderItems.some((item) => Number(item.receivedQty) > 0);
        await order.update({
          status: complete ? 'Received' : (started ? 'Partially Received' : order.status),
          authlstedit: req.user.id,
        }, { transaction });
      }
    }

    await grn.update({
      status: 'Completed',
      postedAt: new Date(),
      authlstedit: req.user.id,
    }, { transaction });

    return grn;
  });

  res.json(await Grn.findByPk(result.id, { include: [ITEM_INCLUDE] }));
});

/**
 * Raises the supplier's invoice from a posted receipt.
 *
 * The purchase is billed for what was accepted, since that is what the business
 * actually took delivery of. Stock is deliberately *not* moved again — the GRN
 * already did that, and a purchase created this way is a financial document only.
 */
export const createInvoice = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const grn = await Grn.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [GrnItem],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
    if (!grn.postedAt) throw Object.assign(new Error('Post the GRN to stock before invoicing it'), { status: 409 });
    if (grn.purchaseId) throw Object.assign(new Error('This GRN has already been invoiced'), { status: 409 });

    const lines = grn.GrnItems
      .filter((item) => Number(item.acceptedQty) > 0)
      .map((item) => {
        const quantity = Number(item.acceptedQty);
        const rate = Number(item.rate);
        const taxable = quantity * rate;
        const gstAmount = taxable * Number(item.gstPercent) / 100;
        return {
          productId: item.productId,
          quantity,
          rate,
          gstPercent: Number(item.gstPercent),
          gstAmount,
          amount: taxable + gstAmount,
          um: item.um,
          primaryUnit: item.primaryUnit,
          unitConversionFactor: Number(item.unitConversionFactor || 1),
          // Carried over from the receipt so the invoice agrees with the stock
          // the GRN actually moved.
          primaryQty: primaryQtyFromLine(item, quantity),
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          germinationPercent: item.germinationPercent,
        };
      });

    if (!lines.length) throw Object.assign(new Error('Nothing on this GRN was accepted, so there is nothing to invoice'), { status: 400 });

    const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.rate, 0);
    const taxAmount = lines.reduce((sum, l) => sum + l.gstAmount, 0);
    const grandTotal = subtotal + taxAmount;
    const paidAmount = Number(req.body.paidAmount || 0);

    const purchase = await Purchase.create({
      purchaseNumber: req.body.purchaseNumber || await nextPurchaseNumber(transaction),
      purchaseDate: req.body.purchaseDate || grn.grnDate,
      branchId: grn.branchId,
      supplierId: grn.supplierId,
      createdBy: req.user.id,
      subtotal,
      taxAmount,
      grandTotal,
      paidAmount,
      paymentStatus: paidAmount >= grandTotal ? 'Paid' : paidAmount > 0 ? 'Partially Paid' : 'Unpaid',
      // Stock came in with the GRN, so this document must not move it again.
      status: 'Invoiced',
      notes: `Raised from ${grn.grnNumber}${grn.supplierInvoiceNo ? ` (supplier invoice ${grn.supplierInvoiceNo})` : ''}`,
      authadd: req.user.id,
    }, { transaction });

    await PurchaseItem.bulkCreate(
      lines.map((line) => ({ ...line, purchaseId: purchase.id, authadd: req.user.id })),
      { transaction },
    );

    await grn.update({ purchaseId: purchase.id, authlstedit: req.user.id }, { transaction });
    await postPurchase({ purchase, transaction, userId: req.user.id });

    return purchase;
  });

  res.status(201).json(created);
});

export const cancel = asyncHandler(async (req, res) => {
  const grn = await Grn.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!grn) return res.status(404).json({ message: 'GRN not found' });
  if (grn.postedAt) {
    return res.status(409).json({
      message: 'This GRN has already moved stock. Raise a purchase return instead of cancelling it.',
    });
  }
  await grn.update({ status: 'Cancelled', authlstedit: req.user.id });
  res.json(grn);
});
