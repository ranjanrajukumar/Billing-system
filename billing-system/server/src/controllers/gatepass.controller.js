import { Op } from 'sequelize';
import { Gatepass, User, Branch } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { paged } from '../utils/pagination.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { withDateRange } from '../utils/dateRange.js';
import { sequelize } from '../models/index.js';

export const getAll = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 10, status } = req.query;
  const offset = (page - 1) * limit;
  let where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'gatepassDate');
  
  if (search) {
    where[Op.or] = [
      { gatepassNumber: { [Op.like]: `%${search}%` } },
      { referenceNumber: { [Op.like]: `%${search}%` } },
      { vehicleNumber: { [Op.like]: `%${search}%` } },
      { driverName: { [Op.like]: `%${search}%` } }
    ];
  }
  
  if (status) {
    where.status = status;
  }

  const { rows, count } = await Gatepass.findAndCountAll({
    where,
    include: [
      { model: User, as: 'creator', attributes: ['name'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['addondt', 'DESC']]
  });

  res.json(paged(rows, count, Number(page), Number(limit)));
});

export const getOne = asyncHandler(async (req, res) => {
  const item = await Gatepass.findOne({
    where: { id: req.params.id, detstatus: false }
  });
  if (!item) return res.status(404).json({ message: 'Gatepass not found' });
  res.json(item);
});

async function nextGatepassNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await Gatepass.count({ where: { gatepassNumber: { [Op.like]: `GP-${year}-%` } }, transaction });
  return `GP-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const create = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authadd = req.user.id;
  data.branchId = data.branchId || req.branchId;

  if (data.status === 'Checked-In') data.checkInTime = new Date();
  if (data.status === 'Checked-Out') data.checkOutTime = new Date();

  const result = await sequelize.transaction(async (t) => {
    if (!data.gatepassNumber) {
      data.gatepassNumber = await nextGatepassNumber(t);
    }
    if (!data.gatepassDate) {
      data.gatepassDate = new Date().toISOString().slice(0, 10);
    }
    return await Gatepass.create(data, { transaction: t });
  });

  res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authlstedit = req.user.id;
  data.editondt = new Date();

  const existing = await Gatepass.findByPk(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Gatepass not found' });

  if (data.status === 'Checked-In' && existing.status !== 'Checked-In') {
    data.checkInTime = new Date();
  } else if (data.status === 'Checked-Out' && existing.status !== 'Checked-Out') {
    data.checkOutTime = new Date();
  }

  await Gatepass.update(data, { where: { id: req.params.id } });
  res.json({ message: 'Gatepass updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  await Gatepass.update(
    { detstatus: true, authdel: req.user.id, delondt: new Date() },
    { where: { id: req.params.id } }
  );
  res.json({ message: 'Gatepass deleted successfully' });
});
