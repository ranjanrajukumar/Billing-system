import { Op } from 'sequelize';
import { SalesReturn, SalesReturnItem, Customer, Product, User, StockMovement, Company } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sequelize } from '../models/index.js';
import { buildInvoicePdf } from '../services/pdf.service.js';

export const getAll = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  let where = { detstatus: false };
  if (search) {
    where['returnNumber'] = { [Op.like]: `%${search}%` };
  }

  const { rows, count } = await SalesReturn.findAndCountAll({
    where,
    include: [
      { model: Customer, attributes: ['customerName', 'mobileNumber'] },
      { model: User, as: 'creator', attributes: ['name'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['addondt', 'DESC']]
  });

  res.json({ data: rows, total: count, page: parseInt(page), pages: Math.ceil(count / limit) });
});

export const getOne = asyncHandler(async (req, res) => {
  const item = await SalesReturn.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: Customer },
      { model: SalesReturnItem, include: [Product] }
    ]
  });
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
});

async function nextReturnNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await SalesReturn.count({ where: { returnNumber: { [Op.like]: `SR-${year}-%` } }, transaction });
  return `SR-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const create = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;
  data.authadd = req.user.id;

  const result = await sequelize.transaction(async (t) => {
    if (!data.returnNumber) {
      data.returnNumber = await nextReturnNumber(t);
    }
    if (!data.returnDate) {
      data.returnDate = new Date().toISOString().slice(0, 10);
    }
    const parent = await SalesReturn.create(data, { transaction: t });
    if (items && items.length > 0) {
      const parentIdField = 'returnId';
      const itemsData = items.map(item => ({ ...item, [parentIdField]: parent.id, authadd: req.user.id }));
      await SalesReturnItem.bulkCreate(itemsData, { transaction: t });

      await Promise.all(items.map((item) => Product.increment('stock', { by: item.quantity, where: { id: item.productId }, transaction: t })));
      
      await StockMovement.bulkCreate(items.map((item) => ({
        productId: item.productId,
        createdBy: req.user.id,
        movementType: 'Adjustment In',
        quantity: item.quantity,
        referenceType: 'Sales Return',
        referenceId: parent.id,
        notes: `Returned via ${parent.returnNumber}`,
        authadd: req.user.id
      })), { transaction: t });
    }
    return parent;
  });

  res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;
  data.authlstedit = req.user.id;
  data.editondt = new Date();

  await sequelize.transaction(async (t) => {
    await SalesReturn.update(data, { where: { id: req.params.id }, transaction: t });

    if (items) {
      const parentIdField = 'returnId';
      await SalesReturnItem.destroy({ where: { [parentIdField]: req.params.id }, transaction: t });
      const itemsData = items.map(item => ({ ...item, [parentIdField]: req.params.id, authadd: req.user.id }));
      await SalesReturnItem.bulkCreate(itemsData, { transaction: t });
    }
  });

  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  await SalesReturn.update(
    { detstatus: true, authdel: req.user.id, delondt: new Date() },
    { where: { id: req.params.id } }
  );
  res.json({ message: 'Deleted successfully' });
});

export const downloadPdf = asyncHandler(async (req, res) => {
  const salesReturn = await SalesReturn.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: Customer }, { model: SalesReturnItem, include: [Product] }]
  });
  if (!salesReturn) return res.status(404).json({ message: 'Not found' });
  
  // Transform SalesReturn format into what buildInvoicePdf expects
  const invoiceMock = {
    invoiceNumber: salesReturn.returnNumber,
    invoiceDate: salesReturn.returnDate,
    Customer: salesReturn.Customer,
    grandTotal: salesReturn.totalRefund,
    subtotal: salesReturn.totalRefund, // simplified
    cgst: 0, sgst: 0, igst: 0, roundOff: 0,
    amountInWords: '', // Could use a words library
    InvoiceItems: salesReturn.SalesReturnItems.map(item => ({
      Product: item.Product,
      quantity: item.quantity,
      rate: item.refundAmount / item.quantity,
      discount: 0,
      gstPercent: 0,
      amount: item.refundAmount
    }))
  };

  const company = await Company.findOne();
  const template = req.query.template || 'standard';
  const buffer = await buildInvoicePdf(invoiceMock, company, template, 'CREDIT NOTE');
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${salesReturn.returnNumber}.pdf"`);
  res.send(buffer);
});
