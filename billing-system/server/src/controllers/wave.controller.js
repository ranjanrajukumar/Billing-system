import { PickWave, SalesOrder, Branch, sequelize } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { Op } from 'sequelize';

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = scopedWhere(req, { detstatus: false });
  if (req.query.status) where.status = req.query.status;

  const { rows, count } = await PickWave.findAndCountAll({
    where,
    include: [
      { model: Branch, attributes: ['id', 'branchName'] },
      { model: SalesOrder, attributes: ['id', 'orderNumber', 'fulfilmentStatus'] }
    ],
    limit,
    offset,
    order: [['addondt', 'DESC']]
  });

  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const wave = await PickWave.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [Branch, SalesOrder]
  });
  if (!wave) return res.status(404).json({ message: 'Wave not found' });
  res.json(wave);
});

export const create = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authadd = req.user.id;
  data.branchId = data.branchId || req.branchId;
  
  const count = await PickWave.count();
  data.waveNumber = data.waveNumber || `WAV-${String(count + 1).padStart(5, '0')}`;

  const wave = await sequelize.transaction(async (t) => {
    const newWave = await PickWave.create(data, { transaction: t });
    
    // If orders are passed, link them to the wave
    if (data.orderIds && data.orderIds.length > 0) {
      await SalesOrder.update(
        { waveId: newWave.id, authlstedit: req.user.id },
        { where: { id: { [Op.in]: data.orderIds }, detstatus: false }, transaction: t }
      );
    }
    return newWave;
  });

  res.status(201).json(wave);
});

export const update = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authlstedit = req.user.id;
  
  await sequelize.transaction(async (t) => {
    const [updated] = await PickWave.update(data, {
      where: { id: req.params.id, detstatus: false }, transaction: t
    });
    if (!updated) throw Object.assign(new Error('Wave not found'), { status: 404 });
    
    if (data.orderIds) {
       // Clear old orders
       await SalesOrder.update(
         { waveId: null, authlstedit: req.user.id },
         { where: { waveId: req.params.id }, transaction: t }
       );
       // Set new orders
       if (data.orderIds.length > 0) {
         await SalesOrder.update(
           { waveId: req.params.id, authlstedit: req.user.id },
           { where: { id: { [Op.in]: data.orderIds }, detstatus: false }, transaction: t }
         );
       }
    }
  });
  
  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (t) => {
    const [updated] = await PickWave.update(
      { detstatus: true, authdel: req.user.id, delondt: new Date(), status: 'Cancelled' },
      { where: { id: req.params.id, detstatus: false }, transaction: t }
    );
    if (!updated) throw Object.assign(new Error('Wave not found'), { status: 404 });
    
    await SalesOrder.update(
      { waveId: null, authlstedit: req.user.id },
      { where: { waveId: req.params.id }, transaction: t }
    );
  });
  
  res.json({ message: 'Deleted successfully' });
});
