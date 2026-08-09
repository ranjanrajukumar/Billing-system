import { Op } from 'sequelize';
import { Company, InvoiceTemplate } from '../models/index.js';
import { BLOCK_TYPES, defaultLayout, renderInvoiceHtml, sampleInvoice } from '../services/invoiceHtml.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildInvoicePdf } from '../services/pdf.service.js';

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

  res.json({ data: rows, total: count, page: parseInt(page), pages: Math.ceil(count / limit) });
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

// Renders a specimen invoice so a template can be previewed without real data.
async function buildSamplePdf(templateConfig) {
  const dummyInvoice = {
    invoiceNumber: `${templateConfig.invoicePrefix || 'INV-'}0001${templateConfig.invoiceSuffix || ''}`,
    invoiceDate: new Date().toISOString().split('T')[0],
    subtotal: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    grandTotal: 1180,
    amountInWords: 'One Thousand One Hundred and Eighty Only',
    Customer: {
      customerName: 'Sample Customer Ltd.',
      gstNumber: '27AAACA1234A1Z5',
      address: '123 Test Street, Testing City, Test State'
    },
    InvoiceItems: [
      {
        Product: { productName: 'Sample Product 1', hsnCode: '1234' },
        quantity: 2,
        rate: 300,
        gstPercent: 18,
        discount: 0,
        amount: 600
      },
      {
        Product: { productName: 'Sample Service 2', hsnCode: '9988' },
        quantity: 1,
        rate: 400,
        gstPercent: 18,
        discount: 0,
        amount: 400
      }
    ]
  };

  const dummyCompany = {
    name: templateConfig.companyName || 'Sample Company',
    address: templateConfig.address || 'Sample Address',
    gstNumber: templateConfig.gstNumber,
    signatureUrl: templateConfig.authorizedSignatory ? 'dummy' : null 
  };

  return buildInvoicePdf(dummyInvoice, dummyCompany, templateConfig, templateConfig.invoiceTitle || 'TAX INVOICE');
}

function sendPdf(res, pdfBuffer, filename) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename=${filename}`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
}

// Live preview of a template configuration that has not been saved yet.
export const generateSample = asyncHandler(async (req, res) => {
  sendPdf(res, await buildSamplePdf(req.body), 'sample.pdf');
});

// Block palette for the drag-and-drop designer, so the client never has to
// keep its own copy of what the renderer supports.
export const listBlockTypes = asyncHandler(async (_req, res) => {
  res.json({ blocks: BLOCK_TYPES, defaultLayout: defaultLayout() });
});

// Live preview while designing: renders the posted layout against sample data.
export const htmlPreview = asyncHandler(async (req, res) => {
  const company = await Company.findOne();
  const html = await renderInvoiceHtml({
    invoice: sampleInvoice(),
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
  sendPdf(res, await buildSamplePdf(template.toJSON()), `template-${template.id}.pdf`);
});
