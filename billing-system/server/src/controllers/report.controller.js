import { Op } from 'sequelize';
import { Customer, Invoice, InvoiceItem, Product } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { exportWorkbook } from '../services/excel.service.js';

function dateWhere(query) {
  const where = {};
  if (query.from || query.to) where.invoiceDate = {};
  if (query.from) where.invoiceDate[Op.gte] = query.from;
  if (query.to) where.invoiceDate[Op.lte] = query.to;
  return where;
}

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

export const exportReport = asyncHandler(async (req, res) => {
  const type = req.params.type || 'sales';
  const rows = type === 'inventory'
    ? await Product.findAll({ raw: true })
    : await Invoice.findAll({ where: dateWhere(req.query), raw: true });
  const buffer = await exportWorkbook(type, rows);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.xlsx"`);
  res.send(buffer);
});
