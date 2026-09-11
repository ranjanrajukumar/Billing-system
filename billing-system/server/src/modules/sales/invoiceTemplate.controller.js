import { Op } from 'sequelize';
import { Company, Customer, Invoice, InvoiceItem, InvoiceTemplate, Product } from '../../models/index.js';
import { BLOCK_TYPES, defaultLayout, renderInvoiceHtml } from './invoiceHtml.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { paged } from '../../utils/pagination.js';
import { buildInvoicePdf } from '../platform/pdf.service.js';

export const getAll = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  let where = { detstatus: false };
  if (search) {
    where['templateName'] = { [Op.like]: `%${search}%` };
  }

  const { rows, count } = await InvoiceTemplate.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['addondt', 'DESC']]
  });

  res.json(paged(rows, count, Number(page), Number(limit)));
});

export const getOne = asyncHandler(async (req, res) => {
  const template = await InvoiceTemplate.findByPk(req.params.id);
  if (!template || template.detstatus) return res.status(404).json({ message: 'Template not found' });
  res.json(template);
});

export const create = asyncHandler(async (req, res) => {
  // If this is set as default, unset others first
  if (req.body.isDefault) {
    await InvoiceTemplate.update({ isDefault: false }, { where: { isDefault: true } });
  }
  const template = await InvoiceTemplate.create(req.body);
  res.status(201).json(template);
});

export const update = asyncHandler(async (req, res) => {
  const template = await InvoiceTemplate.findByPk(req.params.id);
  if (!template) return res.status(404).json({ message: 'Template not found' });

  if (req.body.isDefault && !template.isDefault) {
    await InvoiceTemplate.update({ isDefault: false }, { where: { isDefault: true } });
  }

  await template.update(req.body);
  res.json(template);
});

export const remove = asyncHandler(async (req, res) => {
  const template = await InvoiceTemplate.findByPk(req.params.id);
  if (!template) return res.status(404).json({ message: 'Template not found' });
  
  if (template.isDefault) {
    return res.status(400).json({ message: 'Cannot delete the default template. Please set another template as default first.' });
  }

  await template.update({ detstatus: true, delondt: new Date() });

  // Never leave the company pointing at a template that no longer exists.
  const company = await Company.findOne();
  if (company?.defaultInvoiceTemplate === `template:${template.id}`) {
    await company.update({ defaultInvoiceTemplate: 'standard' });
  }

  res.json({ message: 'Template deleted successfully' });
});

export const duplicate = asyncHandler(async (req, res) => {
  const template = await InvoiceTemplate.findByPk(req.params.id);
  if (!template || template.detstatus) return res.status(404).json({ message: 'Template not found' });

  const duplicateData = template.toJSON();
  delete duplicateData.id;
  delete duplicateData.addondt;
  delete duplicateData.editondt;
  duplicateData.templateName = `${duplicateData.templateName} (Copy)`;
  duplicateData.isDefault = false;

  const newTemplate = await InvoiceTemplate.create(duplicateData);
  res.status(201).json(newTemplate);
});

export const setDefault = asyncHandler(async (req, res) => {
  const template = await InvoiceTemplate.findByPk(req.params.id);
  if (!template || template.detstatus) return res.status(404).json({ message: 'Template not found' });

  await InvoiceTemplate.update({ isDefault: false }, { where: { isDefault: true } });
  await template.update({ isDefault: true });
  const company = await Company.findOne();
  if (company) await company.update({ defaultInvoiceTemplate: `template:${template.id}` });

  res.json(template);
});

async function latestInvoice() {
  return Invoice.findOne({
    where: { detstatus: false },
    include: [Customer, { model: InvoiceItem, include: [Product] }],
    order: [['invoiceDate', 'DESC'], ['id', 'DESC']],
  });
}

async function buildPreviewPdf(invoice, templateConfig) {
  const company = await Company.findOne();
  return buildInvoicePdf(invoice, company, templateConfig, templateConfig.invoiceTitle || 'TAX INVOICE');
}

function sendPdf(res, pdfBuffer, filename) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename=${filename}`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
}

// Previews use a real invoice. The system must never render hard-coded sample
// customers, products, addresses, or monetary amounts as though they were data.
export const generateSample = asyncHandler(async (req, res) => {
  const invoice = await latestInvoice();
  if (!invoice) return res.status(409).json({ message: 'Create an invoice before previewing a template.' });
  sendPdf(res, await buildPreviewPdf(invoice, req.body), `invoice-${invoice.id}-preview.pdf`);
});

// Block palette for the drag-and-drop designer, so the client never has to
// keep its own copy of what the renderer supports.
export const listBlockTypes = asyncHandler(async (_req, res) => {
  res.json({ blocks: BLOCK_TYPES, defaultLayout: defaultLayout() });
});

export const htmlPreview = asyncHandler(async (req, res) => {
  const invoice = await latestInvoice();
  if (!invoice) return res.status(409).json({ message: 'Create an invoice before previewing a template.' });
  const company = await Company.findOne();
  const html = await renderInvoiceHtml({
    invoice,
    company,
    template: req.body || {},
    mediaBase: `${req.protocol}://${req.get('host')}`,
  });
  res.type('html').send(html);
});

// Preview a template that is already saved.
export const previewTemplate = asyncHandler(async (req, res) => {
  const template = await InvoiceTemplate.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!template) return res.status(404).json({ message: 'Template not found' });
  const invoice = await latestInvoice();
  if (!invoice) return res.status(409).json({ message: 'Create an invoice before previewing a template.' });
  sendPdf(res, await buildPreviewPdf(invoice, template.toJSON()), `template-${template.id}.pdf`);
});
