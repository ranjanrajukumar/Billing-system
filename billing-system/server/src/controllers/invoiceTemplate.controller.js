import { Op } from 'sequelize';
import { Company, InvoiceTemplate } from '../models/index.js';
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

// Used for live preview
export const generateSample = asyncHandler(async (req, res) => {
  const templateConfig = req.body;
  
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

  // We need to pass the templateConfig to buildInvoicePdf
  const pdfBuffer = await buildInvoicePdf(dummyInvoice, dummyCompany, templateConfig, templateConfig.invoiceTitle || 'TAX INVOICE');
  
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline; filename=sample.pdf',
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
});
