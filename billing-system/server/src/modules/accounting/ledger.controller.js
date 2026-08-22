import { Op } from 'sequelize';
import {
  Customer, Invoice, Payment, Purchase, PurchaseReturn, SalesReturn, Supplier,
} from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

/**
 * Running party ledgers.
 *
 * The ledger is assembled from the documents themselves rather than kept as a
 * separate balance that has to be maintained in step with them. A ledger that
 * is derived cannot drift from the invoices it describes; one that is stored
 * eventually does, and then nobody knows which is right.
 *
 * Debit increases what the party owes us, credit decreases it — for a supplier
 * the sense is reversed, since it is their account in our books.
 */

const asDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

/** Sorts the collected entries by date and accumulates the running balance. */
function runningBalance(entries, openingBalance = 0) {
  const sorted = [...entries].sort((a, b) => {
    if (a.date === b.date) return (a.sortKey || 0) - (b.sortKey || 0);
    return a.date < b.date ? -1 : 1;
  });

  let balance = Number(openingBalance || 0);
  const rows = sorted.map((entry) => {
    balance += Number(entry.debit || 0) - Number(entry.credit || 0);
    return { ...entry, balance: Math.round(balance * 100) / 100 };
  });

  return {
    rows,
    totalDebit: Math.round(rows.reduce((s, r) => s + Number(r.debit || 0), 0) * 100) / 100,
    totalCredit: Math.round(rows.reduce((s, r) => s + Number(r.credit || 0), 0) * 100) / 100,
    closingBalance: Math.round(balance * 100) / 100,
  };
}

function periodWhere(query, field) {
  if (!query.from && !query.to) return {};
  const range = {};
  if (query.from) range[Op.gte] = query.from;
  if (query.to) range[Op.lte] = query.to;
  return { [field]: range };
}

/**
 * A customer's account: invoices raised, money received, returns and credits.
 */
export const customerLedger = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });

  const [invoices, returns] = await Promise.all([
    Invoice.findAll({
      where: {
        customerId: customer.id,
        detstatus: false,
        status: { [Op.ne]: 'Cancelled' },
        ...periodWhere(req.query, 'invoiceDate'),
      },
      include: [Payment],
      order: [['invoiceDate', 'ASC']],
    }),
    SalesReturn.findAll({
      where: { customerId: customer.id, detstatus: false, ...periodWhere(req.query, 'returnDate') },
      order: [['returnDate', 'ASC']],
    }),
  ]);

  const entries = [];

  for (const invoice of invoices) {
    entries.push({
      date: asDate(invoice.invoiceDate),
      sortKey: 1,
      particular: `Invoice ${invoice.invoiceNumber}`,
      voucherType: 'Invoice',
      voucherId: invoice.id,
      voucherNumber: invoice.invoiceNumber,
      debit: Number(invoice.grandTotal || 0),
      credit: 0,
    });

    // Payments are separate lines so the ledger reads as it happened, not as a
    // net figure — "paid 7,000 against a 10,000 bill" is the useful statement.
    for (const payment of (invoice.Payments || []).filter((p) => !p.detstatus)) {
      entries.push({
        date: asDate(payment.paidAt || invoice.invoiceDate),
        sortKey: 2,
        particular: `Payment received (${payment.paymentMethod || 'Cash'})`,
        voucherType: 'Payment',
        voucherId: payment.id,
        voucherNumber: invoice.invoiceNumber,
        debit: 0,
        credit: Number(payment.amount || 0),
      });
    }
  }

  for (const salesReturn of returns) {
    entries.push({
      date: asDate(salesReturn.returnDate),
      sortKey: 3,
      particular: `Sales return ${salesReturn.returnNumber}`,
      voucherType: 'SalesReturn',
      voucherId: salesReturn.id,
      voucherNumber: salesReturn.returnNumber,
      debit: 0,
      credit: Number(salesReturn.totalRefund || 0),
    });
  }

  const opening = Number(customer.openingBalance || 0);
  const ledger = runningBalance(entries, opening);

  res.json({
    party: {
      id: customer.id,
      name: customer.customerName,
      mobile: customer.mobileNumber,
      gstNumber: customer.gstNumber,
      type: 'Customer',
    },
    openingBalance: opening,
    ...ledger,
    outstanding: ledger.closingBalance,
  });
});

/**
 * A supplier's account: purchases billed, payments made, goods returned.
 * The balance is what we owe them.
 */
export const supplierLedger = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

  const [purchases, returns] = await Promise.all([
    Purchase.findAll({
      where: {
        supplierId: supplier.id,
        detstatus: false,
        status: { [Op.ne]: 'Cancelled' },
        ...periodWhere(req.query, 'purchaseDate'),
      },
      order: [['purchaseDate', 'ASC']],
    }),
    PurchaseReturn.findAll({
      where: {
        supplierId: supplier.id,
        detstatus: false,
        status: 'Confirmed',
        ...periodWhere(req.query, 'returnDate'),
      },
      order: [['returnDate', 'ASC']],
    }),
  ]);

  const entries = [];

  for (const purchase of purchases) {
    entries.push({
      date: asDate(purchase.purchaseDate),
      sortKey: 1,
      particular: `Purchase ${purchase.purchaseNumber}`,
      voucherType: 'Purchase',
      voucherId: purchase.id,
      voucherNumber: purchase.purchaseNumber,
      debit: 0,
      credit: Number(purchase.grandTotal || 0),
    });

    const paid = Number(purchase.paidAmount || 0);
    if (paid > 0) {
      entries.push({
        date: asDate(purchase.purchaseDate),
        sortKey: 2,
        particular: `Payment made against ${purchase.purchaseNumber}`,
        voucherType: 'SupplierPayment',
        voucherId: purchase.id,
        voucherNumber: purchase.purchaseNumber,
        debit: paid,
        credit: 0,
      });
    }
  }

  for (const purchaseReturn of returns) {
    entries.push({
      date: asDate(purchaseReturn.returnDate),
      sortKey: 3,
      particular: `Purchase return ${purchaseReturn.returnNumber} (debit note ${purchaseReturn.debitNoteNumber || '-'})`,
      voucherType: 'PurchaseReturn',
      voucherId: purchaseReturn.id,
      voucherNumber: purchaseReturn.returnNumber,
      debit: Number(purchaseReturn.grandTotal || 0),
      credit: 0,
    });
  }

  const opening = Number(supplier.openingBalance || 0);
  // A supplier ledger reads the other way round: credits are what we owe.
  const ledger = runningBalance(entries, -opening);

  res.json({
    party: {
      id: supplier.id,
      name: supplier.supplierName,
      mobile: supplier.mobileNumber,
      gstNumber: supplier.gstNumber,
      type: 'Supplier',
    },
    openingBalance: opening,
    ...ledger,
    outstanding: Math.round(-ledger.closingBalance * 100) / 100,
  });
});

/** Every customer with an outstanding balance — the receivables list. */
export const receivables = asyncHandler(async (_req, res) => {
  const invoices = await Invoice.findAll({
    where: { detstatus: false, status: { [Op.notIn]: ['Cancelled', 'Paid'] } },
    include: [{ model: Customer, attributes: ['id', 'customerName', 'mobileNumber'] }, Payment],
  });

  const byCustomer = new Map();
  for (const invoice of invoices) {
    const paid = (invoice.Payments || [])
      .filter((p) => !p.detstatus)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const due = Number(invoice.grandTotal || 0) - paid;
    if (due <= 0.01) continue;

    const key = invoice.customerId;
    const entry = byCustomer.get(key) || {
      customerId: key,
      customerName: invoice.Customer?.customerName || 'Unknown',
      mobile: invoice.Customer?.mobileNumber || null,
      invoiceCount: 0,
      outstanding: 0,
      oldestDate: invoice.invoiceDate,
    };
    entry.invoiceCount += 1;
    entry.outstanding += due;
    if (invoice.invoiceDate < entry.oldestDate) entry.oldestDate = invoice.invoiceDate;
    byCustomer.set(key, entry);
  }

  const rows = [...byCustomer.values()]
    .map((row) => ({ ...row, outstanding: Math.round(row.outstanding * 100) / 100 }))
    .sort((a, b) => b.outstanding - a.outstanding);

  res.json({ rows, total: Math.round(rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100 });
});

/** Every supplier we still owe — the payables list. */
export const payables = asyncHandler(async (_req, res) => {
  const purchases = await Purchase.findAll({
    where: { detstatus: false, status: { [Op.ne]: 'Cancelled' }, paymentStatus: { [Op.ne]: 'Paid' } },
    include: [{ model: Supplier, attributes: ['id', 'supplierName', 'mobileNumber'] }],
  });

  const bySupplier = new Map();
  for (const purchase of purchases) {
    const due = Number(purchase.grandTotal || 0) - Number(purchase.paidAmount || 0);
    if (due <= 0.01) continue;

    const key = purchase.supplierId;
    const entry = bySupplier.get(key) || {
      supplierId: key,
      supplierName: purchase.Supplier?.supplierName || 'Unknown',
      mobile: purchase.Supplier?.mobileNumber || null,
      purchaseCount: 0,
      outstanding: 0,
      oldestDate: purchase.purchaseDate,
    };
    entry.purchaseCount += 1;
    entry.outstanding += due;
    if (purchase.purchaseDate < entry.oldestDate) entry.oldestDate = purchase.purchaseDate;
    bySupplier.set(key, entry);
  }

  const rows = [...bySupplier.values()]
    .map((row) => ({ ...row, outstanding: Math.round(row.outstanding * 100) / 100 }))
    .sort((a, b) => b.outstanding - a.outstanding);

  res.json({ rows, total: Math.round(rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100 });
});
