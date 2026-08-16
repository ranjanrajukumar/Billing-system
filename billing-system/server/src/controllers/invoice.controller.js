import { Op } from 'sequelize';
import { sequelize, Customer, Invoice, InvoiceItem, Product, Company, Payment, InvoiceTemplate, ProductSerial, JournalEntry } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { calculateInvoice } from '../utils/invoiceMath.js';
import { getPagination, paged } from '../utils/pagination.js';
import { buildInvoicePdf } from '../services/pdf.service.js';
import { renderInvoiceHtml } from '../services/invoiceHtml.service.js';
import { assertAvailable, deductReserved, postStockTransaction } from '../services/stock.service.js';
import { postSale, reverseEntry } from '../services/accounting.service.js';
import { priceFor, unitSnapshot } from '../utils/units.js';
import { recordCouponUse, releaseCouponUse, validateCoupon } from '../services/coupon.service.js';
import { allocate, consume, restoreFromItems } from '../services/batch.service.js';
import { withDateRange } from '../utils/dateRange.js';
import { statusForPayments } from './payment.controller.js';
import {
  loyaltyConfig, movePoints, pointsForAmount, reverseInvoicePoints, validateRedemption,
} from '../services/loyalty.service.js';

// Optional fields a bill of supply prints; all default to blank or zero.
const DOCUMENT_FIELDS = [
  'orderNumber', 'orderDate', 'dmNumber', 'dmDate', 'manualDm', 'manualDmDate',
  'transporter', 'vehicleNo', 'lrNumber', 'totalBags', 'remark',
  'quantityDiscount', 'cashDiscount', 'specialDiscount',
  'freightDeducted', 'packingCharge', 'freightCharge', 'otherCharges', 'cess',
];

// The subset of the above that changes what the invoice is worth.
const CHARGE_FIELDS = [
  'quantityDiscount', 'cashDiscount', 'specialDiscount', 'freightDeducted',
  'packingCharge', 'freightCharge', 'otherCharges', 'cess',
];

async function nextInvoiceNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await Invoice.count({ where: { invoiceNumber: { [Op.like]: `INV-${year}-%` } }, transaction });
  return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  // In multi-branch mode a user only sees their own branch's records.
  // Accepts either an explicit from/to pair or a named period such as
  // last3Months, so every screen filters the same way.
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'invoiceDate');
  const { rows, count } = await Invoice.findAndCountAll({
    where,
    distinct: true,
    include: [{ model: Customer }, { model: InvoiceItem, include: Product }],
    limit,
    offset,
    order: [['invoiceDate', 'DESC'], ['id', 'DESC']]
  });
  res.json(paged(rows, count, page, limit));
});

export const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.params.id, detstatus: false }, include: [{ model: Customer }, { model: InvoiceItem, include: Product }, Payment] });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  res.json(invoice);
});

export const createInvoice = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const customer = await Customer.findOne({ where: { id: req.body.customerId, detstatus: false }, transaction });
    if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
    const company = await Company.findOne({ transaction });
    const companyState = company?.state || process.env.COMPANY_STATE || customer.state;

    const productIds = req.body.items.map((item) => item.productId);
    const products = await Product.findAll({ where: { id: productIds }, transaction, lock: transaction.LOCK.UPDATE });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = req.body.items.map((item) => {
      const product = byId.get(Number(item.productId));
      if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });

      // Stock is held in the primary unit, so every line carries what it costs
      // in that unit alongside what the customer was billed.
      return {
        ...item,
        // An unpriced line falls back to this customer's tier, and to the
        // secondary-unit price when they are buying by the box.
        rate: item.rate ?? priceFor(product, { tier: customer.priceTier, billedUnit: item.um }),
        gstPercent: item.gstPercent ?? product.gstPercent,
        mrp: item.mrp ?? product.mrp ?? null,
        ...unitSnapshot(product, item.um, item.quantity),
      };
    });

    // Availability is judged at the branch making the sale, not company-wide.
    // Use primaryQty for availability checks — stock is always tracked in the primary unit.
    await assertAvailable(
      items.map((it) => ({ ...it, quantity: it.primaryQty })),
      req.branchId, transaction,
    );

    // Coupon and points both reduce the taxable value before GST is worked out.
    const grossTaxable = items.reduce(
      (sum, item) => sum + Math.max(Number(item.quantity) * Number(item.rate) - Number(item.discount || 0), 0),
      0,
    );

    let couponDiscount = 0;
    let appliedCoupon = null;
    if (req.body.couponCode) {
      const result = await validateCoupon({
        code: req.body.couponCode,
        customerId: customer.id,
        orderValue: grossTaxable,
        transaction,
      });
      appliedCoupon = result.coupon;
      couponDiscount = result.discount;
    }

    const config = loyaltyConfig(company);
    const redemption = await validateRedemption({
      customer,
      points: req.body.redeemPoints,
      // Points can only be spent on what is left after the coupon.
      orderValue: grossTaxable - couponDiscount,
      config,
    });

    const totals = calculateInvoice(items, customer.state, companyState, {
      couponDiscount,
      pointsDiscount: redemption.amount,
      charges: CHARGE_FIELDS.reduce((acc, field) => ({ ...acc, [field]: req.body[field] }), {}),
    });
    const invoice = await Invoice.create({
      invoiceNumber: req.body.invoiceNumber || await nextInvoiceNumber(transaction),
      invoiceDate: req.body.invoiceDate,
      branchId: req.branchId,
      customerId: customer.id,
      paymentMethod: req.body.paymentMethod,
      createdBy: req.user.id,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      grandTotal: totals.grandTotal,
      roundOff: totals.roundOff,
      amountInWords: totals.amountInWords,
      couponId: appliedCoupon?.id || null,
      couponCode: appliedCoupon?.code || null,
      couponDiscount,
      pointsRedeemed: redemption.points,
      pointsDiscount: redemption.amount,
      notes: req.body.notes,
      // Document references, dispatch details and the printed charge boxes.
      ...Object.fromEntries(DOCUMENT_FIELDS
        .filter((field) => req.body[field] !== undefined && req.body[field] !== '')
        .map((field) => [field, req.body[field]])),
    }, { transaction });

    // A line is split into one row per seed lot it draws from, so the bill can
    // be traced back to the bags that left the shelf. Products with no lots
    // recorded produce a single row exactly as before.
    const rows = [];
    for (const item of totals.items) {
      const allocations = await allocate({
        productId: item.productId,
        branchId: req.branchId,
        quantity: item.quantity,
        batchId: item.batchId,
        transaction,
      });

      if (!allocations.length) {
        rows.push({ item, quantity: Number(item.quantity), batch: null });
        continue;
      }

      await consume(allocations, { transaction, userId: req.user.id });
      for (const allocation of allocations) {
        rows.push({ item, quantity: allocation.quantity, batch: allocation.batch });
      }
    }

    await InvoiceItem.bulkCreate(rows.map(({ item, quantity, batch }) => {
      // Money follows the quantity, so a split line still sums to the original.
      const share = Number(item.quantity) > 0 ? quantity / Number(item.quantity) : 1;
      return {
        invoiceId: invoice.id,
        productId: item.productId,
        quantity,
        rate: item.rate,
        discount: Number(item.discount || 0) * share,
        gstPercent: item.gstPercent,
        gstAmount: Number(item.gstAmount) * share,
        amount: Number(item.amount) * share,
        packing: item.packing || null,
        um: item.um || null,
        mrp: item.mrp ?? null,
        // Unit conversion snapshot for audit trail.
        primaryUnit: item.primaryUnit || null,
        unitConversionFactor: item.unitConversionFactor || 1,
        primaryQty: Number(item.primaryQty || item.quantity) * share,
        batchId: batch?.id || null,
        // Copied, not just linked, so a reprint survives the lot being edited.
        batchNumber: batch?.batchNumber || null,
        germinationPercent: batch?.germinationPercent ?? null,
        expiryDate: batch?.expiryDate || null,
      };
    }), { transaction });

    // Stock is always tracked in the primary unit, so deduct primaryQty.
    // One call per line moves the quantity and writes the ledger row together.
    for (const item of totals.items) {
      const deductQty = Number(item.primaryQty || item.quantity);
      await postStockTransaction({
        productId: item.productId,
        branchId: req.branchId,
        quantity: -deductQty,
        movementType: 'Sale',
        referenceType: 'Invoice',
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        unitCost: byId.get(Number(item.productId))?.purchasePrice ?? null,
        transactionDate: invoice.invoiceDate,
        notes: `Sold ${item.quantity} ${item.um || 'PCS'}${item.um !== item.primaryUnit ? ` (= ${deductQty} ${item.primaryUnit})` : ''} via Invoice ${invoice.invoiceNumber}`,
        transaction,
        userId: req.user.id,
      });
    }

    // Spend the points, log the coupon, then award points on what was paid.
    if (appliedCoupon) {
      await recordCouponUse({
        coupon: appliedCoupon, customerId: customer.id, invoiceId: invoice.id,
        discount: couponDiscount, userId: req.user.id, transaction,
      });
    }
    if (redemption.points > 0) {
      await movePoints({
        customerId: customer.id, points: -redemption.points, entryType: 'Redeemed',
        invoiceId: invoice.id, notes: `Redeemed against ${invoice.invoiceNumber}`,
        userId: req.user.id, transaction,
      });
    }
    const earned = pointsForAmount(totals.grandTotal, config);
    if (earned > 0) {
      await movePoints({
        customerId: customer.id, points: earned, entryType: 'Earned',
        invoiceId: invoice.id, notes: `Earned on ${invoice.invoiceNumber}`,
        userId: req.user.id, transaction,
      });
      await invoice.update({ pointsEarned: earned }, { transaction });
    }

    // A credit sale is unpaid until money is actually recorded against it,
    // and carries a due date so the outstanding amount can be aged.
    if (req.body.paymentMethod === 'Credit') {
      const creditDays = Number(company?.creditDays ?? 30);
      const due = new Date(invoice.invoiceDate);
      due.setDate(due.getDate() + creditDays);
      await invoice.update({
        status: 'Unpaid',
        dueDate: req.body.dueDate || due.toISOString().slice(0, 10),
      }, { transaction });
    } else {
      await Payment.create({
        invoiceId: invoice.id,
        amount: totals.grandTotal,
        paymentMethod: req.body.paymentMethod,
        // An immediate payment happens on the sale date, which matters when an
        // invoice is back-dated; otherwise day-based reports miss it.
        paidAt: invoice.invoiceDate,
        authadd: req.user.id
      }, { transaction });
    }

    // Books the sale, the GST collected and the cost of the goods that left.
    // No-op unless the accounting module is on, so a shop is unaffected.
    await postSale({
      invoice,
      costOfGoods: totals.items.reduce((sum, item) => {
        const cost = Number(byId.get(Number(item.productId))?.purchasePrice || 0);
        return sum + cost * Number(item.primaryQty || item.quantity);
      }, 0),
      transaction,
      userId: req.user.id,
    });

    return invoice;
  });
  const invoice = await Invoice.findOne({ where: { id: created.id}, include: [{ model: Customer }, { model: InvoiceItem, include: Product }, Payment] });
  res.status(201).json(invoice);
});

/**
 * Edits an invoice in place, keeping its number.
 *
 * An invoice is not just a record: issuing it moved stock out of a branch and
 * out of specific seed lots, consumed a coupon, and moved loyalty points. So an
 * edit unwinds all of that first and then re-applies it from the new figures,
 * inside one transaction. Anything less would leave stock or points drifting a
 * little further from the truth with every correction.
 *
 * Payments already recorded are deliberately left alone — money that changed
 * hands is not ours to rewrite — and the status is recomputed from them.
 */
export const updateInvoice = asyncHandler(async (req, res) => {
  const updated = await sequelize.transaction(async (transaction) => {
    const existing = await Invoice.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [InvoiceItem, Payment],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!existing) throw Object.assign(new Error('Invoice not found'), { status: 404 });

    const paid = (existing.Payments || [])
      .filter((p) => !p.detstatus)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const customer = await Customer.findOne({
      where: { id: req.body.customerId || existing.customerId, detstatus: false },
      transaction,
    });
    if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });

    const company = await Company.findOne({ transaction });
    const companyState = company?.state || process.env.COMPANY_STATE || customer.state;
    const branchId = existing.branchId || req.branchId;

    // ---- Unwind the original invoice ----
    await restoreFromItems(existing.InvoiceItems, { transaction, userId: req.user.id });
    for (const item of existing.InvoiceItems) {
      await postStockTransaction({
        productId: item.productId,
        branchId,
        quantity: Number(item.primaryQty || item.quantity),
        movementType: 'Adjustment In',
        referenceType: 'Invoice Edit Reversal',
        referenceId: existing.id,
        referenceNumber: existing.invoiceNumber,
        notes: `Reversed original line before editing ${existing.invoiceNumber}`,
        transaction,
        userId: req.user.id,
      });
    }
    await reverseInvoicePoints({ invoiceId: existing.id, userId: req.user.id, transaction });
    await releaseCouponUse({ invoiceId: existing.id, userId: req.user.id, transaction });
    await InvoiceItem.destroy({ where: { invoiceId: existing.id }, transaction });

    // ---- Work out the new invoice ----
    const productIds = req.body.items.map((item) => item.productId);
    const products = await Product.findAll({ where: { id: productIds }, transaction, lock: transaction.LOCK.UPDATE });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = req.body.items.map((item) => {
      const product = byId.get(Number(item.productId));
      if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });
      return {
        ...item,
        rate: item.rate ?? priceFor(product, { tier: customer.priceTier, billedUnit: item.um }),
        gstPercent: item.gstPercent ?? product.gstPercent,
        mrp: item.mrp ?? product.mrp ?? null,
        // An edit converts units exactly as the original sale did. Without this
        // a bill raised in BOX and later corrected would deduct BOX-many
        // primary units, drifting stock a little further with every correction.
        ...unitSnapshot(product, item.um, item.quantity),
      };
    });

    // Checked after the reversal, so an edit that merely moves a line around
    // is not refused for stock the invoice itself was holding. Availability is
    // judged in the primary unit, which is what the shelf is counted in.
    await assertAvailable(
      items.map((it) => ({ ...it, quantity: it.primaryQty })),
      branchId, transaction,
    );

    const grossTaxable = items.reduce(
      (sum, item) => sum + Math.max(Number(item.quantity) * Number(item.rate) - Number(item.discount || 0), 0),
      0,
    );

    let couponDiscount = 0;
    let appliedCoupon = null;
    if (req.body.couponCode) {
      const result = await validateCoupon({
        code: req.body.couponCode,
        customerId: customer.id,
        orderValue: grossTaxable,
        transaction,
      });
      appliedCoupon = result.coupon;
      couponDiscount = result.discount;
    }

    const config = loyaltyConfig(company);
    const redemption = await validateRedemption({
      customer,
      points: req.body.redeemPoints,
      orderValue: grossTaxable - couponDiscount,
      config,
    });

    const totals = calculateInvoice(items, customer.state, companyState, {
      couponDiscount,
      pointsDiscount: redemption.amount,
      charges: CHARGE_FIELDS.reduce((acc, field) => ({ ...acc, [field]: req.body[field] }), {}),
    });

    // Refusing here rather than silently leaving the customer in credit.
    if (paid > Number(totals.grandTotal) + 0.009) {
      throw Object.assign(
        new Error(`${paid.toFixed(2)} has already been paid against this invoice, which is more than the new total of ${Number(totals.grandTotal).toFixed(2)}. Remove or reduce the payment first.`),
        { status: 409 },
      );
    }

    await existing.update({
      invoiceDate: req.body.invoiceDate || existing.invoiceDate,
      customerId: customer.id,
      paymentMethod: req.body.paymentMethod || existing.paymentMethod,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      grandTotal: totals.grandTotal,
      roundOff: totals.roundOff,
      amountInWords: totals.amountInWords,
      couponId: appliedCoupon?.id || null,
      couponCode: appliedCoupon?.code || null,
      couponDiscount,
      pointsRedeemed: redemption.points,
      pointsDiscount: redemption.amount,
      pointsEarned: 0,
      notes: req.body.notes ?? existing.notes,
      authlstedit: req.user.id,
      ...Object.fromEntries(DOCUMENT_FIELDS
        .filter((field) => req.body[field] !== undefined && req.body[field] !== '')
        .map((field) => [field, req.body[field]])),
    }, { transaction });

    // ---- Re-apply stock, lots and lines ----
    const rows = [];
    for (const item of totals.items) {
      const allocations = await allocate({
        productId: item.productId,
        branchId,
        quantity: item.quantity,
        batchId: item.batchId,
        transaction,
      });
      if (!allocations.length) {
        rows.push({ item, quantity: Number(item.quantity), batch: null });
        continue;
      }
      await consume(allocations, { transaction, userId: req.user.id });
      for (const allocation of allocations) {
        rows.push({ item, quantity: allocation.quantity, batch: allocation.batch });
      }
    }

    await InvoiceItem.bulkCreate(rows.map(({ item, quantity, batch }) => {
      const share = Number(item.quantity) > 0 ? quantity / Number(item.quantity) : 1;
      return {
        invoiceId: existing.id,
        productId: item.productId,
        quantity,
        rate: item.rate,
        discount: Number(item.discount || 0) * share,
        gstPercent: item.gstPercent,
        gstAmount: Number(item.gstAmount) * share,
        amount: Number(item.amount) * share,
        packing: item.packing || null,
        um: item.um || null,
        mrp: item.mrp ?? null,
        // The same unit snapshot the original sale stored, so a reprint of an
        // edited invoice still shows how the quantity was converted.
        primaryUnit: item.primaryUnit || null,
        unitConversionFactor: item.unitConversionFactor || 1,
        primaryQty: Number(item.primaryQty || item.quantity) * share,
        batchId: batch?.id || null,
        batchNumber: batch?.batchNumber || null,
        germinationPercent: batch?.germinationPercent ?? null,
        expiryDate: batch?.expiryDate || null,
      };
    }), { transaction });

    for (const item of totals.items) {
      await postStockTransaction({
        productId: item.productId,
        branchId,
        quantity: -Number(item.primaryQty || item.quantity),
        movementType: 'Sale',
        referenceType: 'Invoice Edit',
        referenceId: existing.id,
        referenceNumber: existing.invoiceNumber,
        transactionDate: existing.invoiceDate,
        notes: `Revised via Invoice ${existing.invoiceNumber}`,
        transaction,
        userId: req.user.id,
      });
    }

    if (appliedCoupon) {
      await recordCouponUse({
        coupon: appliedCoupon, customerId: customer.id, invoiceId: existing.id,
        discount: couponDiscount, userId: req.user.id, transaction,
      });
    }
    if (redemption.points > 0) {
      await movePoints({
        customerId: customer.id, points: -redemption.points, entryType: 'Redeemed',
        invoiceId: existing.id, notes: `Redeemed against ${existing.invoiceNumber}`,
        userId: req.user.id, transaction,
      });
    }
    const earned = pointsForAmount(totals.grandTotal, config);
    if (earned > 0) {
      await movePoints({
        customerId: customer.id, points: earned, entryType: 'Earned',
        invoiceId: existing.id, notes: `Earned on ${existing.invoiceNumber}`,
        userId: req.user.id, transaction,
      });
      await existing.update({ pointsEarned: earned }, { transaction });
    }

    // Status follows the money actually recorded, not the payment method.
    await existing.update({ status: statusForPayments(paid, totals.grandTotal) }, { transaction });

    return existing;
  });

  const invoice = await Invoice.findOne({
    where: { id: updated.id },
    include: [{ model: Customer }, { model: InvoiceItem, include: Product }, Payment],
  });
  res.json(invoice);
});

export const removeInvoice = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const invoice = await Invoice.findOne({ where: { id: req.params.id, detstatus: false }, include: [InvoiceItem], transaction });
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
    
    // Soft delete invoice
    await Invoice.update({ detstatus: true, authdel: req.user.id, delondt: new Date(), status: 'Cancelled' }, { where: { id: invoice.id }, transaction });

    // Give back redeemed points, take back awarded ones, free the coupon.
    await reverseInvoicePoints({ invoiceId: invoice.id, userId: req.user.id, transaction });
    await releaseCouponUse({ invoiceId: invoice.id, userId: req.user.id, transaction });

    // Payments belong to the cancelled invoice, so retire them too.
    await Payment.update(
      { detstatus: true, authdel: req.user.id, delondt: new Date() },
      { where: { invoiceId: invoice.id, detstatus: false }, transaction }
    );

    // The accounting entry is reversed rather than removed: a cancelled sale
    // still happened, and the books should say so.
    const entry = await JournalEntry.findOne({
      where: { sourceType: 'Invoice', sourceId: invoice.id, status: 'Posted', detstatus: false },
      transaction,
    });
    if (entry) {
      await reverseEntry({
        entryId: entry.id,
        userId: req.user.id,
        transaction,
        narration: `Cancellation of invoice ${invoice.invoiceNumber}`,
      });
    }
    
    // Reverse stock at the location that made the sale, logging each reversal.
    for (const item of invoice.InvoiceItems) {
      await postStockTransaction({
        productId: item.productId,
        branchId: invoice.branchId || req.branchId,
        quantity: Number(item.primaryQty || item.quantity),
        movementType: 'Sale Return',
        referenceType: 'Invoice Cancellation',
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        batchId: item.batchId || null,
        notes: `Reversed via Cancelled Invoice ${invoice.invoiceNumber}`,
        transaction,
        userId: req.user.id,
      });
    }

    // Seed lots go back to the exact batches the sale drew from, so a cancelled
    // bill cannot quietly move stock between lots.
    await restoreFromItems(invoice.InvoiceItems, { transaction, userId: req.user.id });

    // Serials sold on this bill come back into stock at the same location.
    await ProductSerial.update(
      {
        status: 'In Stock',
        branchId: invoice.branchId || req.branchId,
        invoiceId: null,
        customerId: null,
        soldAt: null,
        authlstedit: req.user.id,
      },
      { where: { invoiceId: invoice.id, detstatus: false }, transaction },
    );
  });

  res.json({ message: 'Invoice cancelled and stock reversed' });
});

// Renders a real invoice through the drag-and-drop HTML layout.
export const invoiceHtml = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: Customer }, { model: InvoiceItem, include: Product }]
  });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

  const company = await Company.findOne();
  const selected = req.query.template || company?.defaultInvoiceTemplate || '';
  let template = {};
  if (String(selected).startsWith('template:')) {
    const saved = await InvoiceTemplate.findOne({
      where: { id: String(selected).replace('template:', ''), detstatus: false, isActive: true }
    });
    if (saved) template = saved.toJSON();
  }

  res.type('html').send(await renderInvoiceHtml({
    invoice,
    company,
    template,
    mediaBase: `${req.protocol}://${req.get('host')}`,
  }));
});

export const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.params.id, detstatus: false }, include: [{ model: Customer }, { model: InvoiceItem, include: Product }] });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  // Unscoped so the logo bytes come along for rendering.
  const company = await Company.unscoped().findOne();
  const selectedTemplate = req.query.template || company?.defaultInvoiceTemplate || 'standard';
  let template = selectedTemplate;

  if (String(selectedTemplate).startsWith('template:')) {
    const templateId = String(selectedTemplate).replace('template:', '');
    const savedTemplate = await InvoiceTemplate.findOne({ where: { id: templateId, detstatus: false, isActive: true } });
    // An explicit request for a missing template is an error, but a stale
    // company default must not take every invoice PDF down with it.
    if (!savedTemplate && req.query.template) {
      return res.status(404).json({ message: 'Invoice template not found' });
    }
    template = savedTemplate ? savedTemplate.toJSON() : 'standard';
  }

  const buffer = await buildInvoicePdf(invoice, company, template, template.invoiceTitle || 'TAX INVOICE');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  res.send(buffer);
});

/**
 * Confirm a Draft invoice — validates available stock and deducts it.
 *
 * This is the "Invoice Confirmation → Stock Deduction" step described in the
 * WMS flow. Creating an invoice does not move stock; only this confirmation
 * does. If available stock (total minus reserved) is insufficient for any line,
 * the whole operation is rejected with a clear 409 and the stock is untouched.
 *
 * When the invoice is linked to a confirmed Sales Order the reservation created
 * by that order is consumed here: both the physical stock and the reservation
 * column decrease together (deductReserved with hasReservation=true).
 *
 * Invoices created the old way (createInvoice, which still deducts immediately)
 * already have status 'Paid' or 'Unpaid' and this action will be a no-op for
 * them — a guard at the top returns 400 for already-confirmed invoices.
 */
export const confirmInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: Customer },
      { model: InvoiceItem, include: [Product] },
      Payment,
    ],
  });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  if (invoice.status !== 'Draft') {
    return res.status(400).json({ message: `Invoice is already ${invoice.status} — cannot confirm again` });
  }

  const branchId = invoice.branchId || req.branchId;
  // Does this invoice come from a Sales Order that already locked stock?
  const salesOrderId = invoice.orderNumber ? null : null; // placeholder — extend if SO-Invoice link added later
  const hasReservation = false; // Extend to true when SO→Invoice link is implemented

  await sequelize.transaction(async (transaction) => {
    const products = await Product.findAll({
      where: { id: invoice.InvoiceItems.map((i) => i.productId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    for (const item of invoice.InvoiceItems) {
      const deductQty = Number(item.primaryQty || item.quantity);
      await deductReserved({
        productId: item.productId,
        branchId,
        quantity: deductQty,
        transaction,
        userId: req.user.id,
        movementType: 'Sale',
        referenceType: 'Invoice',
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        unitCost: byId.get(Number(item.productId))?.purchasePrice ?? null,
        transactionDate: invoice.invoiceDate,
        notes: `Confirmed Invoice ${invoice.invoiceNumber} — deducted ${deductQty} ${item.primaryUnit || 'PCS'}`,
        hasReservation,
      });
    }

    // Determine payment status after confirmation.
    const payments = (invoice.Payments || []).filter((p) => !p.detstatus);
    const paid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    let newStatus = 'Unpaid';
    if (invoice.paymentMethod !== 'Credit') {
      newStatus = 'Paid';
      // If no payment was recorded yet (Draft with non-credit method), create one.
      if (paid === 0) {
        await Payment.create({
          invoiceId: invoice.id,
          amount: invoice.grandTotal,
          paymentMethod: invoice.paymentMethod,
          paidAt: invoice.invoiceDate,
          authadd: req.user.id,
        }, { transaction });
      }
    }

    await invoice.update({ status: newStatus, authlstedit: req.user.id }, { transaction });
  });

  const updated = await Invoice.findOne({
    where: { id: invoice.id },
    include: [{ model: Customer }, { model: InvoiceItem, include: Product }, Payment],
  });
  res.json(updated);
});

