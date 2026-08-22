import { Op } from 'sequelize';
import { Quotation, QuotationItem, Customer, Product, User } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { paged } from '../../utils/pagination.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { withDateRange } from '../../utils/dateRange.js';
import { sequelize } from '../../models/index.js';
import { itemsTotal, normalizeOrderItems } from '../../utils/lineItems.js';
import { documentOutputHandlers } from '../platform/documentOutput.js';

const loadQuotation = (req) => Quotation.findOne({
  where: { id: req.params.id, detstatus: false },
  include: [{ model: Customer }, { model: QuotationItem, include: [Product] }]
});

export const { downloadPdf, html } = documentOutputHandlers('quotation', loadQuotation);

export const getAll = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  // In multi-branch mode a user only sees their own branch's records.
  let where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'quotationDate');
  if (search) {
    where['quotationNumber'] = { [Op.like]: `%${search}%` };
  }
  if (req.query.status) {
    where.status = req.query.status;
  }

  const { rows, count } = await Quotation.findAndCountAll({
    where,
    include: [
      { model: Customer, attributes: ['customerName', 'mobileNumber'] },
      { model: User, as: 'creator', attributes: ['name'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['addondt', 'DESC']]
  });

  res.json(paged(rows, count, Number(page), Number(limit)));
});

export const getOne = asyncHandler(async (req, res) => {
  const item = await Quotation.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: Customer },
      { model: QuotationItem, include: [Product] }
    ]
  });
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
});

async function nextQuotationNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await Quotation.count({ where: { quotationNumber: { [Op.like]: `QT-${year}-%` } }, transaction });
  return `QT-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const create = asyncHandler(async (req, res) => {
  const { items, ...data } = req.body;
  data.authadd = req.user.id;
  // The list is filtered by branch, so a record saved without one would be
  // invisible the moment it was created.
  data.branchId = data.branchId || req.branchId;

  const result = await sequelize.transaction(async (t) => {
    if (!data.quotationNumber) {
      data.quotationNumber = await nextQuotationNumber(t);
    }
    if (!data.quotationDate) {
      data.quotationDate = new Date().toISOString().slice(0, 10);
    }
    if (!data.totalAmount && items && items.length > 0) {
      data.totalAmount = itemsTotal(items);
    }
    const parent = await Quotation.create(data, { transaction: t });
    if (items && items.length > 0) {
      const itemsData = normalizeOrderItems(items).map(item => ({ ...item, quotationId: parent.id, authadd: req.user.id }));
      await QuotationItem.bulkCreate(itemsData, { transaction: t });
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
    await Quotation.update(data, { where: { id: req.params.id }, transaction: t });

    if (items) {
      await QuotationItem.destroy({ where: { quotationId: req.params.id }, transaction: t });
      const itemsData = normalizeOrderItems(items).map(item => ({ ...item, quotationId: req.params.id, authadd: req.user.id }));
      await QuotationItem.bulkCreate(itemsData, { transaction: t });
    }
  });

  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  await Quotation.update(
    { detstatus: true, authdel: req.user.id, delondt: new Date() },
    { where: { id: req.params.id } }
  );
  res.json({ message: 'Deleted successfully' });
});
