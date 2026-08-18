import { InboundAppointment, Supplier, PurchaseOrder, Branch } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { Op } from 'sequelize';

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = scopedWhere(req, { detstatus: false });
  
  if (req.query.status) {
    where.status = req.query.status;
  }
  
  if (req.query.search) {
    where[Op.or] = [
      { appointmentNumber: { [Op.like]: `%${req.query.search}%` } },
      { dockNumber: { [Op.like]: `%${req.query.search}%` } },
      { vehicleNumber: { [Op.like]: `%${req.query.search}%` } }
    ];
  }

  const { rows, count } = await InboundAppointment.findAndCountAll({
    where,
    include: [
      { model: Supplier, attributes: ['id', 'supplierName'] },
      { model: PurchaseOrder, attributes: ['id', 'poNumber'] },
      { model: Branch, attributes: ['id', 'branchName'] }
    ],
    limit,
    offset,
    order: [['expectedArrival', 'ASC']]
  });

  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const appointment = await InboundAppointment.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [Supplier, PurchaseOrder, Branch]
  });
  if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
  res.json(appointment);
});

export const create = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authadd = req.user.id;
  data.branchId = data.branchId || req.branchId;
  
  if (data.supplierId === '') data.supplierId = null;
  if (data.poId === '') data.poId = null;

  const count = await InboundAppointment.count();
  data.appointmentNumber = data.appointmentNumber || `APT-${String(count + 1).padStart(5, '0')}`;

  const appointment = await InboundAppointment.create(data);
  res.status(201).json(appointment);
});

export const update = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authlstedit = req.user.id;
  
  if (data.supplierId === '') data.supplierId = null;
  if (data.poId === '') data.poId = null;
  
  const [updated] = await InboundAppointment.update(data, {
    where: { id: req.params.id, detstatus: false }
  });
  if (!updated) return res.status(404).json({ message: 'Appointment not found' });
  
  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  const [updated] = await InboundAppointment.update(
    { detstatus: true, authdel: req.user.id, delondt: new Date(), status: 'Cancelled' },
    { where: { id: req.params.id, detstatus: false } }
  );
  if (!updated) return res.status(404).json({ message: 'Appointment not found' });
  
  res.json({ message: 'Deleted successfully' });
});
