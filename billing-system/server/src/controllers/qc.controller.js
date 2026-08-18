import { QcInspection, Grn, Product, User, SalesReturn, RepairOrder, sequelize } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { postStockTransaction } from '../services/stock.service.js';
import { Op } from 'sequelize';

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.status) where.status = req.query.status;

  const { rows, count } = await QcInspection.findAndCountAll({
    where,
    include: [
      { model: Grn, attributes: ['id', 'grnNumber', 'branchId'] },
      { model: SalesReturn, attributes: ['id', 'returnNumber', 'branchId'] },
      { model: Product, attributes: ['id', 'productName', 'sku'] },
      { model: User, as: 'inspector', attributes: ['id', 'name'] }
    ],
    limit,
    offset,
    order: [['addondt', 'DESC']]
  });

  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const inspection = await QcInspection.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [Grn, SalesReturn, Product, { model: User, as: 'inspector' }]
  });
  if (!inspection) return res.status(404).json({ message: 'Inspection not found' });
  res.json(inspection);
});

export const create = asyncHandler(async (req, res) => {
  const data = req.body;
  data.authadd = req.user.id;
  
  const count = await QcInspection.count();
  data.inspectionNumber = data.inspectionNumber || `QC-${String(count + 1).padStart(5, '0')}`;

  const inspection = await QcInspection.create(data);
  res.status(201).json(inspection);
});

export const update = asyncHandler(async (req, res) => {
  const { passedQty, failedQty, notes, status } = req.body;
  
  await sequelize.transaction(async (t) => {
    const inspection = await QcInspection.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [Grn],
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!inspection) throw Object.assign(new Error('Inspection not found'), { status: 404 });
    if (inspection.status === 'Passed' || inspection.status === 'Failed') {
      throw Object.assign(new Error('This inspection is already finalized'), { status: 400 });
    }

    const nextPassed = Number(passedQty ?? inspection.passedQty);
    const nextFailed = Number(failedQty ?? inspection.failedQty);
    
    let nextStatus = status || inspection.status;
    if (nextPassed + nextFailed >= inspection.inspectedQty) {
      nextStatus = nextFailed > 0 ? (nextPassed > 0 ? 'Partial' : 'Failed') : 'Passed';
    }

    await inspection.update({
      passedQty: nextPassed,
      failedQty: nextFailed,
      status: nextStatus,
      notes,
      inspectorId: req.user.id,
      authlstedit: req.user.id
    }, { transaction: t });

    // If there is passed stock, move it to Available Stock by posting stock transaction
    if (nextStatus !== 'Pending' && nextPassed > 0) {
       const branchId = inspection.Grn?.branchId || inspection.SalesReturn?.branchId;
       const movementType = inspection.returnId ? 'Sale Return' : 'GRN';
       const refType = inspection.returnId ? 'Sales Return' : 'QC Inspection';
       const refNum = inspection.returnId ? inspection.SalesReturn?.returnNumber : inspection.inspectionNumber;
       const notesStr = inspection.returnId ? `QC Passed for Return ${refNum}` : `QC Passed for GRN ${inspection.Grn?.grnNumber}`;

       await postStockTransaction({
         productId: inspection.productId,
         branchId: branchId,
         quantity: nextPassed,
         movementType: movementType,
         referenceType: refType,
         referenceId: inspection.id,
         referenceNumber: refNum,
         notes: notesStr,
         transaction: t,
         userId: req.user.id,
       });
       
       // Note: Batch creation logic similar to GRN post needs to happen here 
       // or be triggered via WarehouseTask putaway.
    }
    
    // If there is failed stock, generate a RepairOrder (Quarantine)
    if (nextStatus !== 'Pending' && nextFailed > 0) {
      const existingRepair = await RepairOrder.findOne({ where: { qcInspectionId: inspection.id }, transaction: t });
      if (!existingRepair) {
        const branchId = inspection.Grn?.branchId || inspection.SalesReturn?.branchId;
        const count = await RepairOrder.count({ transaction: t });
        await RepairOrder.create({
          repairNumber: `REP-${String(count + 1).padStart(5, '0')}`,
          productId: inspection.productId,
          branchId: branchId,
          qcInspectionId: inspection.id,
          quantity: nextFailed,
          issueDescription: `Failed QC Inspection ${inspection.inspectionNumber}. Notes: ${notes || 'None'}`,
          status: 'Pending',
          authadd: req.user.id
        }, { transaction: t });
      }
    }
  });

  res.json({ message: 'Updated successfully' });
});

export const remove = asyncHandler(async (req, res) => {
  const [updated] = await QcInspection.update(
    { detstatus: true, authdel: req.user.id, delondt: new Date() },
    { where: { id: req.params.id, detstatus: false } }
  );
  if (!updated) return res.status(404).json({ message: 'Inspection not found' });
  res.json({ message: 'Deleted successfully' });
});
