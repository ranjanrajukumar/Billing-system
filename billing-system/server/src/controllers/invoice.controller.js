import { Op } from 'sequelize';
import { sequelize, Customer, Invoice, InvoiceItem, Product, Company, Payment, StockMovement, InvoiceTemplate } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { calculateInvoice } from '../utils/invoiceMath.js';
import { getPagination, paged } from '../utils/pagination.js';
import { buildInvoicePdf } from '../services/pdf.service.js';

async function nextInvoiceNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await Invoice.count({ where: { invoiceNumber: { [Op.like]: `INV-${year}-%` } }, transaction });
  return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.from || req.query.to) where.invoiceDate = {};
  if (req.query.from) where.invoiceDate[Op.gte] = req.query.from;
  if (req.query.to) where.invoiceDate[Op.lte] = req.query.to;
  const { rows, count } = await Invoice.findAndCountAll({
    where,
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
      if (Number(product.stock) < Number(item.quantity)) throw Object.assign(new Error(`Insufficient stock for ${product.productName}`), { status: 409 });
      return { ...item, rate: item.rate ?? product.sellingPrice, gstPercent: item.gstPercent ?? product.gstPercent };
    });

    const totals = calculateInvoice(items, customer.state, companyState);
    const invoice = await Invoice.create({
      invoiceNumber: req.body.invoiceNumber || await nextInvoiceNumber(transaction),
      invoiceDate: req.body.invoiceDate,
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
      notes: req.body.notes
    }, { transaction });

    await InvoiceItem.bulkCreate(totals.items.map((item) => ({
      invoiceId: invoice.id,
      productId: item.productId,
      quantity: item.quantity,
      rate: item.rate,
      discount: item.discount,
      gstPercent: item.gstPercent,
      gstAmount: item.gstAmount,
      amount: item.amount
    })), { transaction });

    await Promise.all(totals.items.map((item) => Product.decrement('stock', {
      by: item.quantity,
      where: { id: item.productId },
      transaction
    })));

    await StockMovement.bulkCreate(totals.items.map((item) => ({
      productId: item.productId,
      createdBy: req.user.id,
      movementType: 'Sale',
      quantity: -item.quantity,
      referenceType: 'Invoice',
      referenceId: invoice.id,
      notes: `Sold via Invoice ${invoice.invoiceNumber}`,
      authadd: req.user.id
    })), { transaction });

    await Payment.create({ invoiceId: invoice.id, amount: totals.grandTotal, paymentMethod: req.body.paymentMethod }, { transaction });
    return invoice;
  });
  const invoice = await Invoice.findOne({ where: { id: created.id}, include: [{ model: Customer }, { model: InvoiceItem, include: Product }, Payment] });
  res.status(201).json(invoice);
});

export const removeInvoice = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const invoice = await Invoice.findOne({ where: { id: req.params.id, detstatus: false }, include: [InvoiceItem], transaction });
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
    
    // Soft delete invoice
    await Invoice.update({ detstatus: true, authdel: req.user.id, delondt: new Date() }, { where: { id: invoice.id }, transaction });
    
    // Reverse stock
    for (const item of invoice.InvoiceItems) {
      await Product.increment('stock', { by: item.quantity, where: { id: item.productId }, transaction });
    }
    
    // Create stock movement logs for cancellation
    await StockMovement.bulkCreate(invoice.InvoiceItems.map((item) => ({
      productId: item.productId,
      createdBy: req.user.id,
      movementType: 'Sale Return',
      quantity: item.quantity, // Positive quantity for return
      referenceType: 'Invoice Cancellation',
      referenceId: invoice.id,
      notes: `Reversed via Cancelled Invoice ${invoice.invoiceNumber}`,
      authadd: req.user.id
    })), { transaction });
  });

  res.json({ message: 'Invoice cancelled and stock reversed' });
});

export const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.params.id, detstatus: false }, include: [{ model: Customer }, { model: InvoiceItem, include: Product }] });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  const company = await Company.findOne();
  const selectedTemplate = req.query.template || company?.defaultInvoiceTemplate || 'standard';
  let template = selectedTemplate;

  if (String(selectedTemplate).startsWith('template:')) {
    const templateId = String(selectedTemplate).replace('template:', '');
    const savedTemplate = await InvoiceTemplate.findOne({ where: { id: templateId, detstatus: false, isActive: true } });
    if (!savedTemplate) return res.status(404).json({ message: 'Invoice template not found' });
    template = savedTemplate.toJSON();
  }

  const buffer = await buildInvoicePdf(invoice, company, template, template.invoiceTitle || 'TAX INVOICE');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  res.send(buffer);
});
