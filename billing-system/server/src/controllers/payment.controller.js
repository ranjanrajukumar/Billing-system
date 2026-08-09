import { Customer, Invoice, Payment, sequelize } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

async function paidTotal(invoiceId, transaction) {
  const sum = await Payment.sum('amount', { where: { invoiceId, detstatus: false }, transaction });
  return round2(sum || 0);
}

export function statusForPayments(paid, grandTotal) {
  if (round2(paid) <= 0) return 'Unpaid';
  return round2(paid) >= round2(grandTotal) ? 'Paid' : 'Partially Paid';
}

// Recalculates the invoice status from the payments that are actually recorded.
export async function syncInvoiceStatus(invoice, transaction) {
  const paid = await paidTotal(invoice.id, transaction);
  await invoice.update({ status: statusForPayments(paid, invoice.grandTotal) }, { transaction });
  return paid;
}

export const listPayments = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.invoiceId) where.invoiceId = req.query.invoiceId;

  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: [{ model: Invoice, include: Customer }],
    limit,
    offset,
    order: [['paidAt', 'DESC'], ['id', 'DESC']]
  });
  res.json(paged(rows, count, page, limit));
});

// Payment history plus the outstanding balance for one invoice.
export const getInvoicePayments = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({
    where: { id: req.params.invoiceId, detstatus: false },
    include: Customer
  });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

  const payments = await Payment.findAll({
    where: { invoiceId: invoice.id, detstatus: false },
    order: [['paidAt', 'DESC'], ['id', 'DESC']]
  });
  const paid = round2(payments.reduce((sum, payment) => sum + Number(payment.amount), 0));

  res.json({
    invoice,
    payments,
    summary: {
      grandTotal: round2(invoice.grandTotal),
      paid,
      outstanding: round2(Number(invoice.grandTotal) - paid),
      status: invoice.status
    }
  });
});

export const createPayment = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const invoice = await Invoice.findOne({
      where: { id: req.body.invoiceId, detstatus: false },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });

    const amount = round2(req.body.amount);
    if (!(amount > 0)) throw Object.assign(new Error('Payment amount must be greater than zero'), { status: 400 });

    const alreadyPaid = await paidTotal(invoice.id, transaction);
    const outstanding = round2(Number(invoice.grandTotal) - alreadyPaid);
    if (amount > outstanding) {
      throw Object.assign(
        new Error(`Payment exceeds the outstanding balance of ${outstanding.toFixed(2)}`),
        { status: 400 }
      );
    }

    const payment = await Payment.create({
      invoiceId: invoice.id,
      amount,
      paymentMethod: req.body.paymentMethod,
      referenceNumber: req.body.referenceNumber,
      paidAt: req.body.paidAt || new Date(),
      authadd: req.user?.id
    }, { transaction });

    await syncInvoiceStatus(invoice, transaction);
    return payment;
  });

  res.status(201).json(result);
});

export const removePayment = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const payment = await Payment.findOne({
      where: { id: req.params.id, detstatus: false },
      transaction
    });
    if (!payment) throw Object.assign(new Error('Payment not found'), { status: 404 });

    await payment.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() }, { transaction });

    const invoice = await Invoice.findOne({ where: { id: payment.invoiceId }, transaction });
    if (invoice) await syncInvoiceStatus(invoice, transaction);
  });

  res.json({ message: 'Payment removed' });
});
