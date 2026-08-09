import { Op } from 'sequelize';
import ExcelJS from 'exceljs';
import { Customer, Invoice, Payment } from '../models/index.js';

/**
 * Receivables ageing: who owes what, and for how long.
 *
 * Age is measured from the due date where the invoice has one, and from the
 * invoice date otherwise — an invoice given 30 days credit is not overdue on
 * day one, and bucketing it as though it were would overstate the problem.
 */

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.floor((new Date(to) - new Date(from)) / 86400000);

export const BUCKETS = [
  { key: 'current', label: 'Not yet due', min: -Infinity, max: 0 },
  { key: 'd0_30', label: '0-30 days', min: 1, max: 30 },
  { key: 'd31_60', label: '31-60 days', min: 31, max: 60 },
  { key: 'd61_90', label: '61-90 days', min: 61, max: 90 },
  { key: 'd90_plus', label: '90+ days', min: 91, max: Infinity },
];

const bucketFor = (days) => BUCKETS.find((b) => days >= b.min && days <= b.max) || BUCKETS[0];

const emptyBuckets = () => Object.fromEntries(BUCKETS.map((b) => [b.key, 0]));

export async function ageingData({ asOf = today(), customerId = null } = {}) {
  const where = { detstatus: false, invoiceDate: { [Op.lte]: asOf } };
  if (customerId) where.customerId = customerId;

  const invoices = await Invoice.findAll({
    where,
    include: [
      { model: Customer, attributes: ['id', 'customerName', 'mobileNumber', 'city', 'state'] },
      { model: Payment, where: { detstatus: false }, required: false, attributes: ['amount', 'paidAt'] },
    ],
    order: [['invoiceDate', 'ASC']],
  });

  const byCustomer = new Map();
  const openInvoices = [];

  for (const invoice of invoices) {
    // Only payments received by the as-of date count, so a back-dated report
    // reflects the position on that day rather than today's.
    // paidAt is a timestamp; compare on the date part so a payment made at any
    // time on the as-of day still counts as received that day.
    const paid = (invoice.Payments || [])
      .filter((p) => !p.paidAt || new Date(p.paidAt).toISOString().slice(0, 10) <= asOf)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const outstanding = round2(Number(invoice.grandTotal) - paid);
    if (outstanding <= 0.009) continue;

    const dueFrom = invoice.dueDate || invoice.invoiceDate;
    const days = daysBetween(dueFrom, asOf);
    const bucket = bucketFor(days);

    const id = invoice.customerId;
    const entry = byCustomer.get(id) || {
      customerId: id,
      customerName: invoice.Customer?.customerName || 'Unknown',
      mobileNumber: invoice.Customer?.mobileNumber || '',
      city: invoice.Customer?.city || '',
      invoiceCount: 0,
      outstanding: 0,
      oldestDays: 0,
      buckets: emptyBuckets(),
    };
    entry.invoiceCount += 1;
    entry.outstanding = round2(entry.outstanding + outstanding);
    entry.buckets[bucket.key] = round2(entry.buckets[bucket.key] + outstanding);
    entry.oldestDays = Math.max(entry.oldestDays, days);
    byCustomer.set(id, entry);

    openInvoices.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate || null,
      customerId: id,
      customerName: entry.customerName,
      grandTotal: round2(invoice.grandTotal),
      paid: round2(paid),
      outstanding,
      daysOverdue: days,
      bucket: bucket.key,
      bucketLabel: bucket.label,
    });
  }

  const customers = [...byCustomer.values()].sort((a, b) => b.outstanding - a.outstanding);

  const totals = {
    outstanding: round2(customers.reduce((s, c) => s + c.outstanding, 0)),
    customers: customers.length,
    invoices: openInvoices.length,
    buckets: emptyBuckets(),
  };
  for (const customer of customers) {
    for (const bucket of BUCKETS) {
      totals.buckets[bucket.key] = round2(totals.buckets[bucket.key] + customer.buckets[bucket.key]);
    }
  }

  return {
    asOf,
    buckets: BUCKETS.map(({ key, label }) => ({ key, label })),
    customers,
    invoices: openInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue),
    totals,
  };
}

export async function ageingWorkbook(data) {
  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ header: 'Field', key: 'field', width: 26 }, { header: 'Value', key: 'value', width: 22 }];
  summary.addRow({ field: 'As at', value: data.asOf });
  summary.addRow({ field: 'Customers owing', value: data.totals.customers });
  summary.addRow({ field: 'Open invoices', value: data.totals.invoices });
  summary.addRow({ field: 'Total outstanding', value: data.totals.outstanding });
  data.buckets.forEach((b) => summary.addRow({ field: b.label, value: data.totals.buckets[b.key] }));
  summary.getRow(1).font = { bold: true };
  summary.getColumn('field').font = { bold: true };

  const byCustomer = workbook.addWorksheet('By customer');
  byCustomer.columns = [
    { header: 'Customer', key: 'customerName', width: 32 },
    { header: 'Mobile', key: 'mobileNumber', width: 16 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'Invoices', key: 'invoiceCount', width: 10 },
    ...data.buckets.map((b) => ({ header: b.label, key: b.key, width: 14 })),
    { header: 'Total Due', key: 'outstanding', width: 14 },
    { header: 'Oldest (days)', key: 'oldestDays', width: 14 },
  ];
  data.customers.forEach((c) => byCustomer.addRow({ ...c, ...c.buckets }));
  byCustomer.getRow(1).font = { bold: true };
  byCustomer.views = [{ state: 'frozen', ySplit: 1 }];

  const byInvoice = workbook.addWorksheet('By invoice');
  byInvoice.columns = [
    { header: 'Invoice', key: 'invoiceNumber', width: 20 },
    { header: 'Date', key: 'invoiceDate', width: 14 },
    { header: 'Due', key: 'dueDate', width: 14 },
    { header: 'Customer', key: 'customerName', width: 32 },
    { header: 'Total', key: 'grandTotal', width: 14 },
    { header: 'Paid', key: 'paid', width: 14 },
    { header: 'Outstanding', key: 'outstanding', width: 14 },
    { header: 'Days', key: 'daysOverdue', width: 10 },
    { header: 'Bucket', key: 'bucketLabel', width: 16 },
  ];
  data.invoices.forEach((i) => byInvoice.addRow(i));
  byInvoice.getRow(1).font = { bold: true };
  byInvoice.views = [{ state: 'frozen', ySplit: 1 }];

  return workbook.xlsx.writeBuffer();
}
