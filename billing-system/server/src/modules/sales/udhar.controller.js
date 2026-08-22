import { Op, col, fn } from 'sequelize';
import { Customer, Invoice, Payment, sequelize } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { statusForPayments } from './payment.controller.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

const daysBetween = (from, to) =>
  Math.floor((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24));

/**
 * Billed and paid totals per customer, in two aggregate queries rather than
 * loading every invoice. Cancelled invoices and removed payments are excluded.
 */
async function outstandingByCustomer(customerId = null) {
  const invoiceWhere = { detstatus: false };
  if (customerId) invoiceWhere.customerId = customerId;

  const billedRows = await Invoice.findAll({
    attributes: ['customerId', [fn('SUM', col('grand_total')), 'billed'], [fn('COUNT', col('id')), 'invoiceCount']],
    where: invoiceWhere,
    group: ['customerId'],
    raw: true,
  });

  const paidRows = await Payment.findAll({
    attributes: [[col('Invoice.customer_id'), 'customerId'], [fn('SUM', col('Payment.amount')), 'paid']],
    where: { detstatus: false },
    include: [{ model: Invoice, attributes: [], where: invoiceWhere, required: true }],
    group: [col('Invoice.customer_id')],
    raw: true,
  });

  const paidByCustomer = new Map(paidRows.map((row) => [Number(row.customerId), Number(row.paid || 0)]));

  return billedRows.map((row) => {
    const billed = round2(row.billed);
    const paid = round2(paidByCustomer.get(Number(row.customerId)) || 0);
    return {
      customerId: Number(row.customerId),
      invoiceCount: Number(row.invoiceCount || 0),
      billed,
      paid,
      outstanding: round2(billed - paid),
    };
  });
}

/** Unpaid invoices for a customer, oldest first — the order udhar is settled in. */
async function openInvoices(customerId, transaction) {
  const invoices = await Invoice.findAll({
    where: { customerId, detstatus: false },
    include: [{ model: Payment, where: { detstatus: false }, required: false }],
    order: [['invoiceDate', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  return invoices
    .map((invoice) => {
      const paid = round2((invoice.Payments || []).reduce((sum, p) => sum + Number(p.amount), 0));
      return { invoice, paid, outstanding: round2(Number(invoice.grandTotal) - paid) };
    })
    .filter((entry) => entry.outstanding > 0.009);
}

export const summary = asyncHandler(async (req, res) => {
  const totals = await outstandingByCustomer();
  const owing = totals.filter((row) => row.outstanding > 0.009);
  if (!owing.length) return res.json({ customers: [], totals: { outstanding: 0, overdue: 0, customers: 0 } });

  const customers = await Customer.findAll({
    where: { id: owing.map((row) => row.customerId), detstatus: false },
  });
  const byId = new Map(customers.map((customer) => [customer.id, customer]));

  // Overdue is judged per invoice, so it needs the open invoices themselves.
  const dueRows = await Invoice.findAll({
    attributes: ['id', 'customerId', 'invoiceNumber', 'invoiceDate', 'dueDate', 'grandTotal'],
    where: { customerId: owing.map((row) => row.customerId), detstatus: false, status: { [Op.in]: ['Unpaid', 'Partially Paid'] } },
    order: [['invoiceDate', 'ASC']],
    raw: true,
  });

  const now = today();
  const oldestByCustomer = new Map();
  for (const row of dueRows) {
    if (!oldestByCustomer.has(row.customerId)) oldestByCustomer.set(row.customerId, row);
  }

  const search = String(req.query.search || '').toLowerCase();
  const result = owing
    .map((row) => {
      const customer = byId.get(row.customerId);
      const oldest = oldestByCustomer.get(row.customerId);
      const dueDate = oldest?.dueDate || null;
      return {
        ...row,
        customerName: customer?.customerName || 'Unknown',
        mobileNumber: customer?.mobileNumber || '',
        oldestInvoiceNumber: oldest?.invoiceNumber || null,
        oldestInvoiceDate: oldest?.invoiceDate || null,
        dueDate,
        overdueDays: dueDate && dueDate < now ? daysBetween(dueDate, now) : 0,
      };
    })
    .filter((row) => !search
      || row.customerName.toLowerCase().includes(search)
      || String(row.mobileNumber).includes(search))
    .sort((a, b) => b.outstanding - a.outstanding);

  res.json({
    customers: result,
    totals: {
      customers: result.length,
      outstanding: round2(result.reduce((sum, row) => sum + row.outstanding, 0)),
      overdue: round2(result.filter((row) => row.overdueDays > 0).reduce((sum, row) => sum + row.outstanding, 0)),
    },
  });
});

/** Full khata for one customer: invoices and payments with a running balance. */
export const customerLedger = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ where: { id: req.params.customerId, detstatus: false } });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });

  const invoices = await Invoice.findAll({
    where: { customerId: customer.id, detstatus: false },
    include: [{ model: Payment, where: { detstatus: false }, required: false }],
    order: [['invoiceDate', 'ASC'], ['id', 'ASC']],
  });

  const entries = [];
  for (const invoice of invoices) {
    entries.push({
      date: invoice.invoiceDate,
      type: 'Invoice',
      reference: invoice.invoiceNumber,
      dueDate: invoice.dueDate,
      debit: round2(invoice.grandTotal),
      credit: 0,
    });
    for (const payment of invoice.Payments || []) {
      entries.push({
        date: String(payment.paidAt).slice(0, 10),
        type: 'Payment',
        reference: `${payment.paymentMethod}${payment.referenceNumber ? ` · ${payment.referenceNumber}` : ''}`,
        against: invoice.invoiceNumber,
        debit: 0,
        credit: round2(payment.amount),
      });
    }
  }

  entries.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  let balance = 0;
  const ledger = entries.map((entry) => {
    balance = round2(balance + entry.debit - entry.credit);
    return { ...entry, balance };
  });

  const [totals] = await outstandingByCustomer(customer.id);
  res.json({
    customer,
    ledger,
    summary: totals || { billed: 0, paid: 0, outstanding: 0, invoiceCount: 0 },
  });
});

/** Outstanding split into ageing buckets, measured from the invoice date. */
export const ageing = asyncHandler(async (_req, res) => {
  const invoices = await Invoice.findAll({
    where: { detstatus: false, status: { [Op.in]: ['Unpaid', 'Partially Paid'] } },
    include: [
      { model: Payment, where: { detstatus: false }, required: false },
      { model: Customer, attributes: ['id', 'customerName', 'mobileNumber'] },
    ],
    order: [['invoiceDate', 'ASC']],
  });

  const now = today();
  const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const rows = [];

  for (const invoice of invoices) {
    const paid = round2((invoice.Payments || []).reduce((sum, p) => sum + Number(p.amount), 0));
    const outstanding = round2(Number(invoice.grandTotal) - paid);
    if (outstanding <= 0.009) continue;

    const age = daysBetween(invoice.invoiceDate, now);
    const bucket = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+';
    buckets[bucket] = round2(buckets[bucket] + outstanding);

    rows.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      customerId: invoice.Customer?.id,
      customerName: invoice.Customer?.customerName || 'Unknown',
      outstanding,
      ageDays: age,
      bucket,
      overdue: Boolean(invoice.dueDate && invoice.dueDate < now),
    });
  }

  res.json({ buckets, rows, total: round2(Object.values(buckets).reduce((sum, value) => sum + value, 0)) });
});

/**
 * Records a payment against a customer rather than a single invoice, settling
 * their oldest outstanding invoices first.
 */
export const collect = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const customer = await Customer.findOne({
      where: { id: req.body.customerId, detstatus: false },
      transaction,
    });
    if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });

    let remaining = round2(req.body.amount);
    if (!(remaining > 0)) throw Object.assign(new Error('Amount must be greater than zero'), { status: 400 });

    const open = await openInvoices(customer.id, transaction);
    const totalOutstanding = round2(open.reduce((sum, entry) => sum + entry.outstanding, 0));
    if (remaining > totalOutstanding) {
      throw Object.assign(
        new Error(`Amount exceeds the outstanding balance of ${totalOutstanding.toFixed(2)}`),
        { status: 400 },
      );
    }

    const allocations = [];
    for (const entry of open) {
      if (remaining <= 0.009) break;
      const applied = round2(Math.min(entry.outstanding, remaining));

      await Payment.create({
        invoiceId: entry.invoice.id,
        amount: applied,
        paymentMethod: req.body.paymentMethod || 'Cash',
        referenceNumber: req.body.referenceNumber,
        paidAt: req.body.paidAt || new Date(),
        authadd: req.user?.id,
      }, { transaction });

      const paidNow = round2(entry.paid + applied);
      await entry.invoice.update(
        { status: statusForPayments(paidNow, entry.invoice.grandTotal) },
        { transaction },
      );

      allocations.push({
        invoiceId: entry.invoice.id,
        invoiceNumber: entry.invoice.invoiceNumber,
        applied,
        remainingOnInvoice: round2(entry.outstanding - applied),
      });
      remaining = round2(remaining - applied);
    }

    return { allocations, collected: round2(req.body.amount), unapplied: remaining };
  });

  res.status(201).json({
    message: 'Payment collected',
    ...result,
  });
});
