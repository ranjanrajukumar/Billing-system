import { RepairOrder, Product, Branch, QcInspection, sequelize } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { postStockTransaction } from '../inventory/stock.service.js';

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.status) where.status = req.query.status;

  const { rows, count } = await RepairOrder.findAndCountAll({
    where,
    include: [
      { model: Product, attributes: ['id', 'productName', 'sku'] },
      { model: Branch, attributes: ['id', 'branchName'] },
      { model: QcInspection, attributes: ['id', 'inspectionNumber'] }
    ],
    limit,
    offset,
    order: [['addondt', 'DESC']]
  });

  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const repair = await RepairOrder.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [Product, Branch, QcInspection]
  });
  if (!repair) return res.status(404).json({ message: 'Repair Order not found' });
  res.json(repair);
});

export const create = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authadd = req.user.id;
  
  const count = await RepairOrder.count();
  data.repairNumber = data.repairNumber || `REP-${String(count + 1).padStart(5, '0')}`;
  
  const repair = await RepairOrder.create(data);
  res.status(201).json(repair);
});

export const update = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authlstedit = req.user.id;
  
  await sequelize.transaction(async (t) => {
    const repair = await RepairOrder.findOne({
      where: { id: req.params.id, detstatus: false }, transaction: t, lock: t.LOCK.UPDATE
    });
    if (!repair) throw Object.assign(new Error('Repair order not found'), { status: 404 });
    
    const prevStatus = repair.status;
    await repair.update(data, { transaction: t });
    
    // If transitioning to 'Repaired', move stock out of Quarantine/Damage back to Available
    if (prevStatus !== 'Repaired' && data.status === 'Repaired') {
      await postStockTransaction({
        productId: repair.productId,
        branchId: repair.branchId,
        quantity: repair.quantity,
        movementType: 'Stock Adjustment', // Or a new type 'Repair Complete'
        referenceType: 'Repair Order',
        referenceId: repair.id,
        referenceNumber: repair.repairNumber,
        notes: `Repair completed, moving back to available stock.`,
        transaction: t,
        userId: req.user.id,
      });
    }
    
    // If transitioning to 'Scrapped', we write off the inventory.
    if (prevStatus !== 'Scrapped' && data.status === 'Scrapped') {
       // Typically, we'd log a negative stock adjustment if it was in available stock.
       // However, since we didn't add it to available stock upon QC failure, 
       // it is effectively already out of the available pool. 
       // We might want to log a 'Scrap' movement just for tracking purposes if it was in a bin.
       await postStockTransaction({
        productId: repair.productId,
        branchId: repair.branchId,
        quantity: -Math.abs(repair.quantity),
        movementType: 'Stock Adjustment', 
        referenceType: 'Repair Order',
        referenceId: repair.id,
        referenceNumber: repair.repairNumber,
        notes: `Items scrapped.`,
        transaction: t,
        userId: req.user.id,
      });
    }
  });

  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  const [updated] = await RepairOrder.update(
    { detstatus: true, authdel: req.user.id, delondt: new Date() },
    { where: { id: req.params.id, detstatus: false } }
  );
  if (!updated) return res.status(404).json({ message: 'Repair order not found' });
  
  res.json({ message: 'Deleted successfully' });
});
