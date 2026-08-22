import { Op } from 'sequelize';
import { sequelize, Customer, Invoice, InvoiceItem, Product, ProductVariant, Company, Payment, InvoiceTemplate, ProductSerial, JournalEntry } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { calculateInvoice } from '../../utils/invoiceMath.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { buildInvoicePdf } from '../platform/pdf.service.js';
import { renderInvoiceHtml } from './invoiceHtml.service.js';
import { sendInvoiceEmail } from '../platform/email.service.js';
import { assertAvailable, deductReserved, postStockTransaction } from '../inventory/stock.service.js';
import { postSale, reverseEntry } from '../accounting/accounting.service.js';
import { priceFor, unitSnapshot } from '../../utils/units.js';
import { recordCouponUse, releaseCouponUse, validateCoupon } from './coupon.service.js';
import { allocate, consume, restoreFromItems } from '../inventory/batch.service.js';
import { withDateRange } from '../../utils/dateRange.js';
import { statusForPayments } from './payment.controller.js';
import { normaliseTender } from './tender.service.js';
import { openRegisterFor, recordCashMovement } from '../accounting/cash.service.js';
import {
  loyaltyConfig, movePoints, pointsForAmount, reverseInvoicePoints, validateRedemption,
} from './loyalty.service.js';
import {
  assertNotAlreadyBilled, invoiceLinesFor, invoiceMovedStock, resolveOrderLink,
} from './salesOrderLink.service.js';

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

/**
 * Turns request lines into priced lines, resolving any pack each one names.
 *
 * Shared by create and edit because they had drifted: create understood packs
 * and edit did not, so reopening a pack sale and saving it wrote the line back
 * with no pack at all — the sealed count never got its unit back and the loose
 * pile paid for a sale nobody made from it. One reader of `variantId`, so the
 * two paths cannot disagree again.
 */
async function resolveSaleLines(reqItems, { byId, customer, transaction }) {
  // Packs first: a line that names one is a sealed size with its own price
  // and its own balance, not a quantity of the loose pile.
  const packIds = reqItems.map((i) => Number(i.variantId)).filter(Boolean);
  const packs = new Map();
  if (packIds.length) {
    const found = await ProductVariant.findAll({
      where: { id: packIds, detstatus: false, isActive: true },
      transaction,
    });
    for (const variant of found) packs.set(Number(variant.id), variant);
  }

  return reqItems.map((item) => {
    const product = byId.get(Number(item.productId));
    if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });

    const pack = item.variantId ? packs.get(Number(item.variantId)) : null;
    if (item.variantId && !pack) {
      throw Object.assign(new Error(`Pack ${item.variantId} is not available for sale`), { status: 400 });
    }
    if (pack && Number(pack.productId) !== Number(product.id)) {
      throw Object.assign(
        new Error(`"${pack.variantName}" is not a pack of ${product.productName}`),
        { status: 400 },
      );
    }

    if (pack) {
      // No unit conversion, because there is nothing to convert: the balance
      // for a packaged size is a count of sealed units. Three pouches is
      // three, whatever is inside them.
      return {
        ...item,
        variantId: pack.id,
        rate: item.rate ?? (pack.sellingPrice ?? product.sellingPrice),
        gstPercent: item.gstPercent ?? product.gstPercent,
        mrp: item.mrp ?? pack.mrp ?? product.mrp ?? null,
        um: pack.variantName,
        primaryUnit: pack.variantName,
        unitConversionFactor: 1,
        primaryQty: Number(item.quantity),
        packing: pack.packSize
          ? `${Number(pack.packSize)} ${pack.packUnitCode || ''}`.trim()
          : item.packing || null,
      };
    }

    // Stock is held in the primary unit, so every line carries what it costs
    // in that unit alongside what the customer was billed.
    return {
      ...item,
      variantId: 0,
      // An unpriced line falls back to this customer's tier, and to the
      // secondary-unit price when they are buying by the box.
      rate: item.rate ?? priceFor(product, { tier: customer.priceTier, billedUnit: item.um }),
      gstPercent: item.gstPercent ?? product.gstPercent,
      mrp: item.mrp ?? product.mrp ?? null,
      ...unitSnapshot(product, item.um, item.quantity),
    };
  });
}

export const createInvoice = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const customer = await Customer.findOne({ where: { id: req.body.customerId, detstatus: false }, transaction });
    if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });

    // Billed against a sales order? Then the warehouse may already have moved
    // this stock, and the rule about which system moves it lives in one place.
    const orderLink = req.body.salesOrderId
      ? await resolveOrderLink(req.body.salesOrderId, { transaction })
      : null;
    if (orderLink) {
      assertNotAlreadyBilled(orderLink);
      if (Number(orderLink.order.customerId) !== Number(customer.id)) {
        throw Object.assign(
          new Error(`Sales order ${orderLink.order.orderNumber} belongs to a different customer`),
          { status: 409 },
        );
      }
    }
    // Whether raising this bill is the event that takes stock out of the
    // building. False only when dispatch already did it.
    const movesStock = orderLink ? orderLink.movesStock : true;
    // Stock moves where the order put its hold, which is not necessarily the
    // branch the user is billing from — an order confirmed at the warehouse can
    // be billed from the office. Deducting at the wrong location would find no
    // reservation to consume there and take the quantity out of a shelf that
    // never held it.
    const stockBranchId = orderLink ? (orderLink.order.branchId || req.branchId) : req.branchId;

    const company = await Company.findOne({ transaction });
    const companyState = company?.state || process.env.COMPANY_STATE || customer.state;
    // A new bill inherits the company currency unless one is named on the
    // request. This used to fall back to INR regardless, so changing the
    // global setting left every later invoice still raised in rupees.
    const invoiceCurrency = req.body.currency || company?.currency || 'INR';

    const productIds = req.body.items.map((item) => item.productId);
    const products = await Product.findAll({ where: { id: productIds }, transaction, lock: transaction.LOCK.UPDATE });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = await resolveSaleLines(req.body.items, { byId, customer, transaction });

    // Availability is judged at the branch making the sale, not company-wide.
    // Use primaryQty for availability checks — stock is always tracked in the primary unit.
    //
    // Skipped for an order-linked bill, because the check would be wrong in
    // both directions: a confirmed order has already had this quantity taken
    // out of the available figure by its own reservation, and a dispatched one
    // has had it taken out of stock altogether. Availability was settled when
    // the order was confirmed; asking again here would refuse the bill for
    // stock the order is itself holding.
    if (!orderLink) {
      // `variantId` rides along so each line is checked against the balance it
      // will actually be taken from.
      await assertAvailable(
        items.map((it) => ({ ...it, quantity: it.primaryQty })),
        req.branchId, transaction,
      );
    }

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
      currency: invoiceCurrency,
      couponDiscount,
      pointsDiscount: redemption.amount,
      charges: CHARGE_FIELDS.reduce((acc, field) => ({ ...acc, [field]: req.body[field] }), {}),
    });

    // Worked out before the invoice is written so a bad tender — more money
    // than the bill, a method that is not one — is refused before anything is
    // created rather than after.
    const tender = normaliseTender(req.body, totals.grandTotal);

    const invoice = await Invoice.create({
      invoiceNumber: req.body.invoiceNumber || await nextInvoiceNumber(transaction),
      invoiceDate: req.body.invoiceDate,
      branchId: req.branchId,
      customerId: customer.id,
      // A summary of how it was settled. The payment rows are the authority;
      // this is the largest component, so a mostly-cash sale reads as cash.
      paymentMethod: tender.method,
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
      currency: invoiceCurrency,
      exchangeRate: req.body.exchangeRate || 1.0000,
      subscriptionId: req.body.subscriptionId || null,
      salesOrderId: orderLink?.order.id || null,
      // Document references, dispatch details and the printed charge boxes.
      ...Object.fromEntries(DOCUMENT_FIELDS
        .filter((field) => req.body[field] !== undefined && req.body[field] !== '')
        .map((field) => [field, req.body[field]])),
      // Last, so it wins. `orderNumber` is a free-text box that has always been
      // typed by hand; once there is a real link the printed reference comes
      // from the order itself, because a bill whose printed order number
      // disagrees with the order it is attached to is worse than one with no
      // order number at all.
      ...(orderLink
        ? { orderNumber: orderLink.order.orderNumber, orderDate: orderLink.order.orderDate }
        : {}),
    }, { transaction });

    // A line is split into one row per seed lot it draws from, so the bill can
    // be traced back to the bags that left the shelf. Products with no lots
    // recorded produce a single row exactly as before.
    //
    // A bill that follows a dispatch takes no lots either: the picker already
    // drew them off the shelf, and which lots those were is recorded against
    // the order's lines. Drawing again here would consume the stock twice over
    // in the lot ledger while the branch balance stayed right — the kind of
    // drift that only shows up in an audit weeks later.
    const rows = [];
    for (const item of totals.items) {
      // Lots belong to the loose pile. A sealed pack was filled from a lot at
      // the time it was packed, and drawing from one again here would consume
      // the same stock twice.
      const allocations = movesStock && !item.variantId
        ? await allocate({
          productId: item.productId,
          branchId: stockBranchId,
          quantity: item.quantity,
          batchId: item.batchId,
          transaction,
        })
        : [];

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
        // Which balance the line sold from: 0 is loose, anything else a pack.
        variantId: item.variantId || 0,
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
    //
    // Nothing moves at all when the goods left at dispatch. That leaves this
    // invoice with no rows in the stock ledger, which is exactly how the rest
    // of the system later recognises it as a bill that never took stock — see
    // invoiceMovedStock, which cancellation and editing both ask before
    // putting anything back.
    for (const item of movesStock ? totals.items : []) {
      const deductQty = Number(item.primaryQty || item.quantity);
      const shared = {
        productId: item.productId,
        branchId: stockBranchId,
        referenceType: 'Invoice',
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        unitCost: byId.get(Number(item.productId))?.purchasePrice ?? null,
        transactionDate: invoice.invoiceDate,
        notes: `Sold ${item.quantity} ${item.um || 'PCS'}${item.um !== item.primaryUnit ? ` (= ${deductQty} ${item.primaryUnit})` : ''} via Invoice ${invoice.invoiceNumber}`,
        transaction,
        userId: req.user.id,
      };

      if (item.variantId) {
        // A pack has its own balance and never carries a sales-order
        // reservation — those are held against the loose pile — so it always
        // goes through the plain movement, with the variant named.
        await postStockTransaction({
          ...shared, quantity: -deductQty, movementType: 'Sale', variantId: item.variantId,
        });
      } else if (orderLink?.hasReservation) {
        // The order is holding this quantity against everyone else. Consume
        // the hold and the stock in the same write, so a reservation can never
        // outlive the goods it was made for — a stranded hold is invisible
        // stock: present on the shelf, unsellable to anybody.
        await deductReserved({ ...shared, quantity: deductQty, movementType: 'Sale', hasReservation: true });
      } else {
        await postStockTransaction({ ...shared, quantity: -deductQty, movementType: 'Sale' });
      }
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

    // How the bill was settled: one payment, several, or none at all.
    //
    // Credit is no longer a branch. A sale with nothing tendered is a credit
    // sale, one with less than the total tendered is part credit, and both fall
    // out of the same arithmetic — see tender.service.js.
    for (const line of tender.lines) {
      await Payment.create({
        invoiceId: invoice.id,
        amount: line.amount,
        paymentMethod: line.paymentMethod,
        referenceNumber: line.referenceNumber,
        // An immediate payment happens on the sale date, which matters when an
        // invoice is back-dated; otherwise day-based reports miss it.
        paidAt: invoice.invoiceDate,
        authadd: req.user.id,
      }, { transaction });
    }

    // Anything not tendered is on the customer's account, and needs a due date
    // so it can be aged.
    if (tender.onCredit > 0) {
      const creditDays = Number(company?.creditDays ?? 30);
      const due = new Date(invoice.invoiceDate);
      due.setDate(due.getDate() + creditDays);
      await invoice.update({
        dueDate: req.body.dueDate || due.toISOString().slice(0, 10),
      }, { transaction });
    }

    await invoice.update({
      status: statusForPayments(tender.paid, totals.grandTotal),
    }, { transaction });

    // Cash across the counter goes into the drawer.
    //
    // The till is what somebody counts at the end of a shift, and a cash sale
    // that never reached it makes that count wrong by exactly the amount taken.
    // Skipped silently when no register is open: plenty of shops run this
    // without ever opening one, and refusing the sale would be a worse answer
    // than an uncounted drawer.
    const cashTaken = tender.lines
      .filter((line) => line.paymentMethod === 'Cash')
      .reduce((sum, line) => sum + line.amount, 0);

    if (cashTaken > 0) {
      const register = await openRegisterFor(req.branchId, transaction);
      if (register) {
        await recordCashMovement({
          registerId: register.id,
          entryType: 'Cash Sale',
          amountIn: cashTaken,
          referenceType: 'Invoice',
          referenceId: invoice.id,
          referenceNumber: invoice.invoiceNumber,
          partyName: customer.customerName,
          transactionDate: invoice.invoiceDate,
          transaction,
          userId: req.user.id,
        });
      }
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
  
  if (invoice.Customer?.mobile) {
    import('../platform/sms.service.js')
      .then(({ sendInvoiceSMS }) => sendInvoiceSMS(invoice.Customer.mobile, invoice.invoiceNumber, invoice.grandTotal))
      .catch(err => console.error('Failed to send invoice SMS:', err));
  }

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
    // An edit keeps the currency the bill was raised in: re-stamping an old
    // invoice with today's company setting would silently restate what the
    // customer was actually charged.
    const invoiceCurrency = req.body.currency || existing.currency || company?.currency || 'INR';
    const branchId = existing.branchId || req.branchId;

    // Did this bill ever take stock out? A bill raised against an order the
    // warehouse had already dispatched did not — dispatch did — so editing it
    // is a correction to the money and nothing else. Unwinding stock it never
    // took, and then re-applying it, would put the quantity into the building
    // and take it out again, leaving two spurious ledger rows and a bill that
    // now claims to have moved goods a courier already has. The ledger is the
    // authority on the question; see salesOrderLink.service.js.
    const movedStock = await invoiceMovedStock(existing.id, { transaction });

    // ---- Unwind the original invoice ----
    if (movedStock) {
      // Only the loose lines: a pack is sold sealed and never took a lot,
      // so handing one back would credit a batch that never issued it.
      await restoreFromItems(
        existing.InvoiceItems.filter((item) => !Number(item.variantId)),
        { transaction, userId: req.user.id },
      );
    }
    for (const item of movedStock ? existing.InvoiceItems : []) {
      await postStockTransaction({
        productId: item.productId,
        // Back onto the balance it left: a pack returns to its own sealed
        // count. Without this the loose pile is credited for goods that never
        // came out of it, and the pack count never recovers what it gave up.
        variantId: item.variantId || 0,
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
    const items = await resolveSaleLines(req.body.items, { byId, customer, transaction });

    // Checked after the reversal, so an edit that merely moves a line around
    // is not refused for stock the invoice itself was holding. Availability is
    // judged in the primary unit, which is what the shelf is counted in.
    // A bill that moves no stock has nothing to check.
    if (movedStock) {
      await assertAvailable(
        items.map((it) => ({ ...it, quantity: it.primaryQty })),
        branchId, transaction,
      );
    }

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
      currency: invoiceCurrency,
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
      currency: invoiceCurrency,
      exchangeRate: req.body.exchangeRate ?? existing.exchangeRate,
      authlstedit: req.user.id,
      ...Object.fromEntries(DOCUMENT_FIELDS
        .filter((field) => req.body[field] !== undefined && req.body[field] !== '')
        .map((field) => [field, req.body[field]])),
    }, { transaction });

    // ---- Re-apply stock, lots and lines ----
    const rows = [];
    for (const item of totals.items) {
      const allocations = movedStock && !item.variantId
        ? await allocate({
          productId: item.productId,
          branchId,
          quantity: item.quantity,
          batchId: item.batchId,
          transaction,
        })
        : [];
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
        // The pack this line sold. Dropping it here is what turned a reopened
        // pack sale into loose stock on save.
        variantId: item.variantId || 0,
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

    for (const item of movedStock ? totals.items : []) {
      await postStockTransaction({
        productId: item.productId,
        variantId: item.variantId || 0,
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
    //
    // Only if this bill took any. A bill raised against an order the warehouse
    // had already dispatched never moved stock — dispatch did — so putting the
    // quantity back here would invent goods that are on a courier's van. The
    // ledger is asked rather than a flag on the invoice, because the ledger is
    // what actually recorded the movement. Those goods come back through a
    // sales return when they physically come back, which is the same answer
    // cancelFulfilment gives for an order already on its way.
    const movedStock = await invoiceMovedStock(invoice.id, { transaction });

    for (const item of movedStock ? invoice.InvoiceItems : []) {
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
    // bill cannot quietly move stock between lots. A bill that drew from no lots
    // has nothing to put back.
    if (movedStock) {
      await restoreFromItems(invoice.InvoiceItems, { transaction, userId: req.user.id });
    }

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

export const emailInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: Customer }, { model: InvoiceItem, include: Product }]
  });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  if (!invoice.Customer || !invoice.Customer.email) {
    return res.status(400).json({ message: 'Customer does not have an email address' });
  }

  const company = await Company.unscoped().findOne();
  const selectedTemplate = req.query.template || company?.defaultInvoiceTemplate || 'standard';
  let template = selectedTemplate;

  if (String(selectedTemplate).startsWith('template:')) {
    const templateId = String(selectedTemplate).replace('template:', '');
    const savedTemplate = await InvoiceTemplate.findOne({ where: { id: templateId, detstatus: false, isActive: true } });
    template = savedTemplate ? savedTemplate.toJSON() : 'standard';
  }

  const buffer = await buildInvoicePdf(invoice, company, template, template.invoiceTitle || 'TAX INVOICE');
  
  const result = await sendInvoiceEmail(invoice.Customer.email, invoice, buffer);
  if (result.success) {
    await invoice.update({ emailStatus: 'Sent' });
    res.json({ message: 'Email sent successfully', messageId: result.messageId });
  } else {
    await invoice.update({ emailStatus: 'Failed' });
    res.status(500).json({ message: 'Failed to send email' });
  }
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
 * And when the order has already been dispatched from the warehouse floor, the
 * goods left the building at dispatch and confirming the bill moves no stock at
 * all — it only settles the money. See salesOrderLink.service.js, which both
 * this and createInvoice ask, so the two cannot answer differently.
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

  await sequelize.transaction(async (transaction) => {
    // Does this invoice come from a Sales Order, and if so how far has the
    // warehouse got with it? The order itself is the authority — not the
    // free-text order number printed on the bill, which anybody can type.
    const orderLink = invoice.salesOrderId
      ? await resolveOrderLink(invoice.salesOrderId, { transaction, excludeInvoiceId: invoice.id })
      : null;
    const movesStock = orderLink ? orderLink.movesStock : true;
    const hasReservation = Boolean(orderLink?.hasReservation);

    const products = await Product.findAll({
      where: { id: invoice.InvoiceItems.map((i) => i.productId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    for (const item of movesStock ? invoice.InvoiceItems : []) {
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

  if (updated.Customer?.mobile) {
    import('../platform/sms.service.js')
      .then(({ sendInvoiceSMS }) => sendInvoiceSMS(updated.Customer.mobile, updated.invoiceNumber, updated.grandTotal))
      .catch(err => console.error('Failed to send invoice SMS:', err));
  }

  res.json(updated);
});


/**
 * Raises the bill for a sales order.
 *
 * This is the link the three systems meet at, expressed as one action: the
 * order says what was agreed, the warehouse says what actually went, and this
 * turns whichever of those is now true into an invoice — without anybody
 * retyping the lines into the billing screen and quietly getting one wrong.
 *
 * The quantity billed follows the goods once they have been dispatched, so a
 * short shipment bills short rather than charging for a box the customer never
 * received. Before dispatch there is nothing to follow yet, so it bills what
 * was ordered.
 *
 * Everything else — pricing, GST, coupons, points, the books — is deliberately
 * not reimplemented here. The payload is handed to createInvoice, which is the
 * one place an invoice is made, so an order-raised bill and a counter bill
 * cannot come out differently.
 */
export const invoiceFromSalesOrder = asyncHandler(async (req, res, next) => {
  const link = await resolveOrderLink(req.params.id);
  assertNotAlreadyBilled(link);

  const items = invoiceLinesFor(link);
  if (!items.length) {
    throw Object.assign(
      new Error(
        link.stockLeftAtDispatch
          ? `Nothing on ${link.order.orderNumber} has been dispatched yet, so there is nothing to bill`
          : `Sales order ${link.order.orderNumber} has no lines to bill`,
      ),
      { status: 409 },
    );
  }

  req.body = {
    ...req.body,
    salesOrderId: link.order.id,
    customerId: link.order.customerId,
    invoiceDate: req.body?.invoiceDate || new Date().toISOString().slice(0, 10),
    // An order is a credit relationship until somebody says otherwise: the
    // goods are already promised, and often already gone, so defaulting to a
    // paid bill would record money that has not arrived.
    paymentMethod: req.body?.paymentMethod || 'Credit',
    items,
  };

  return createInvoice(req, res, next);
});
