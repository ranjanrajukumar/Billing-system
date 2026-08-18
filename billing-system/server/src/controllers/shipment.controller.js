import { Shipment, Invoice, sequelize } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { Op } from 'sequelize';

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.status) where.status = req.query.status;

  const { rows, count } = await Shipment.findAndCountAll({
    where,
    include: [
      { model: Invoice, attributes: ['id', 'invoiceNumber', 'status'] }
    ],
    limit,
    offset,
    order: [['addondt', 'DESC']]
  });

  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [Invoice]
  });
  if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
  res.json(shipment);
});

export const create = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authadd = req.user.id;
  
  const count = await Shipment.count();
  data.shipmentNumber = data.shipmentNumber || `SHP-${String(count + 1).padStart(5, '0')}`;
  
  if (!data.shippingDate) {
    data.shippingDate = new Date();
  }

  const shipment = await Shipment.create(data);
  res.status(201).json(shipment);
});

export const update = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authlstedit = req.user.id;
  
  const [updated] = await Shipment.update(data, {
    where: { id: req.params.id, detstatus: false }
  });
  if (!updated) return res.status(404).json({ message: 'Shipment not found' });
  
  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  const [updated] = await Shipment.update(
    { detstatus: true, authdel: req.user.id, delondt: new Date(), status: 'Cancelled' },
    { where: { id: req.params.id, detstatus: false } }
  );
  if (!updated) return res.status(404).json({ message: 'Shipment not found' });
  
  res.json({ message: 'Deleted successfully' });
});
