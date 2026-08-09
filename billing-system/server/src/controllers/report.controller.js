import { Op } from 'sequelize';
import { Customer, Invoice, InvoiceItem, Product } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { exportWorkbook } from '../services/excel.service.js';
import { gstr1Data, gstr1Workbook } from '../services/gstReturn.service.js';
import { ageingData, ageingWorkbook } from '../services/ageing.service.js';
import { resolvePeriod, withDateRange } from '../utils/dateRange.js';

// Named periods (thisMonth, last3Months, thisFinancialYear…) resolve here too.
const dateWhere = (query) => withDateRange({}, query, 'invoiceDate');

export const salesReport = asyncHandler(async (req, res) => {
  const invoices = await Invoice.findAll({ where: dateWhere(req.query), include: Customer, order: [['invoiceDate', 'DESC']] });
  res.json(invoices);
});

export const gstReport = asyncHandler(async (req, res) => {
  const invoices = await Invoice.findAll({ where: dateWhere(req.query), attributes: ['invoiceNumber', 'invoiceDate', 'subtotal', 'cgst', 'sgst', 'igst', 'grandTotal'] });
  res.json(invoices);
});

export const customerReport = asyncHandler(async (_req, res) => {
  const customers = await Customer.findAll({ include: Invoice, order: [['customerName', 'ASC']] });
  res.json(customers);
});

export const productReport = asyncHandler(async (_req, res) => {
  const products = await Product.findAll({ include: InvoiceItem, order: [['productName', 'ASC']] });
  res.json(products);
});

export const inventoryReport = asyncHandler(async (_req, res) => {
  const products = await Product.findAll({ order: [['stock', 'ASC']] });
  res.json(products);
});

/** Defaults to the current month, which is the period a filer normally wants. */
function returnPeriod(query) {
  const resolved = resolvePeriod(query);
  if (resolved.from || resolved.to) return { from: resolved.from, to: resolved.to };
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

export const gstr1Report = asyncHandler(async (req, res) => {
  const { from, to } = returnPeriod(req.query);
  res.json(await gstr1Data({ from, to }));
});

export const gstr1Export = asyncHandler(async (req, res) => {
  const { from, to } = returnPeriod(req.query);
  const data = await gstr1Data({ from, to });
  const buffer = await gstr1Workbook(data);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="GSTR1-${from}-to-${to}.xlsx"`);
  res.send(Buffer.from(buffer));
});

export const ageingReport = asyncHandler(async (req, res) => {
  res.json(await ageingData({ asOf: req.query.asOf, customerId: req.query.customerId }));
});

export const ageingExport = asyncHandler(async (req, res) => {
  const data = await ageingData({ asOf: req.query.asOf, customerId: req.query.customerId });
  const buffer = await ageingWorkbook(data);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Receivables-ageing-${data.asOf}.xlsx"`);
  res.send(Buffer.from(buffer));
});

/**
 * Rows and column headings for each report, shared by the screen and the
 * workbook.
 *
 * Previously every type except inventory exported raw invoice rows, so
 * downloading the Customers report handed you invoices with database column
 * names for headings. The export also ignored the date filter, meaning the file
 * never matched the report it came from.
 */
const EXPORTS = {
  sales: {
    load: (query) => Invoice.findAll({
      where: dateWhere(query),
      include: [{ model: Customer, attributes: ['customerName'] }],
      order: [['invoiceDate', 'DESC']],
    }),
    shape: (invoice) => ({
      'Invoice No': invoice.invoiceNumber,
      Date: invoice.invoiceDate,
      Customer: invoice.Customer?.customerName || '',
      Taxable: Number(invoice.subtotal),
      CGST: Number(invoice.cgst),
      SGST: Number(invoice.sgst),
      IGST: Number(invoice.igst),
      'Round Off': Number(invoice.roundOff),
      Total: Number(invoice.grandTotal),
      Payment: invoice.paymentMethod,
      Status: invoice.status,
    }),
  },
  gst: {
    load: (query) => Invoice.findAll({ where: dateWhere(query), order: [['invoiceDate', 'ASC']] }),
    shape: (invoice) => ({
      'Invoice No': invoice.invoiceNumber,
      Date: invoice.invoiceDate,
      Taxable: Number(invoice.subtotal),
      CGST: Number(invoice.cgst),
      SGST: Number(invoice.sgst),
      IGST: Number(invoice.igst),
      Cess: Number(invoice.cess),
      Total: Number(invoice.grandTotal),
    }),
  },
  customers: {
    load: () => Customer.findAll({ where: { detstatus: false }, order: [['customerName', 'ASC']] }),
    shape: (customer) => ({
      Customer: customer.customerName,
      Mobile: customer.mobileNumber || '',
      City: customer.city || '',
      State: customer.state || '',
      GSTIN: customer.gstNumber || '',
      'Loyalty Points': Number(customer.loyaltyPoints || 0),
    }),
  },
  products: {
    load: () => Product.findAll({ where: { detstatus: false }, order: [['productName', 'ASC']] }),
    shape: (product) => ({
      Product: product.productName,
      HSN: product.hsnCode || '',
      'GST %': Number(product.gstPercent || 0),
      'Purchase Price': Number(product.purchasePrice || 0),
      'Selling Price': Number(product.sellingPrice || 0),
      Stock: Number(product.stock || 0),
    }),
  },
  inventory: {
    load: () => Product.findAll({ where: { detstatus: false }, order: [['stock', 'ASC']] }),
    shape: (product) => ({
      Product: product.productName,
      HSN: product.hsnCode || '',
      Stock: Number(product.stock || 0),
      'Unit Price': Number(product.sellingPrice || 0),
      'Stock Value': Number(product.stock || 0) * Number(product.sellingPrice || 0),
    }),
  },
};

export const exportReport = asyncHandler(async (req, res) => {
  const type = EXPORTS[req.params.type] ? req.params.type : 'sales';
  const { load, shape } = EXPORTS[type];

  const records = await load(req.query);
  const buffer = await exportWorkbook(type, records.map(shape));

  const { from, to } = resolvePeriod(req.query);
  const suffix = from || to ? `-${from || 'start'}-to-${to || 'today'}` : '';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report${suffix}.xlsx"`);
  res.send(buffer);
});
