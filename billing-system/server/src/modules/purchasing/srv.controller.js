import { Op } from 'sequelize';
import { sequelize, Srv, SrvItem, Supplier, Product, Branch, User, ProductBatch } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { postStockTransaction } from '../inventory/stock.service.js';

async function nextSrvNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await Srv.count({ where: { srvNumber: { [Op.like]: `SRV-${year}-%` } }, transaction });
  return `SRV-${year}-${String(count + 1).padStart(5, '0')}`;
}

export const listSrvs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = scopedWhere(req, { detstatus: false });
  const { rows, count } = await Srv.findAndCountAll({
    where,
    distinct: true,
    include: [{ model: Supplier }, { model: Branch }],
    limit,
    offset,
    order: [['srvDate', 'DESC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const getSrv = asyncHandler(async (req, res) => {
  const srv = await Srv.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: Supplier },
      { model: Branch },
      { model: SrvItem, include: [Product] },
      { model: User, as: 'receiver', attributes: ['id', 'firstName', 'lastName'] },
    ],
  });
  if (!srv) return res.status(404).json({ message: 'SRV not found' });
  res.json(srv);
});

export const createSrv = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const srvNumber = req.body.srvNumber || await nextSrvNumber(transaction);
    const srv = await Srv.create({
      srvNumber,
      srvDate: req.body.srvDate,
      supplierId: req.body.supplierId || null,
      branchId: req.branchId,
      status: 'Draft',
      supplierInvoiceNo: req.body.supplierInvoiceNo,
      supplierInvoiceDate: req.body.supplierInvoiceDate,
      transporter: req.body.transporter,
      vehicleNo: req.body.vehicleNo,
      lrNumber: req.body.lrNumber,
      remarks: req.body.remarks,
      authadd: req.user.id,
    }, { transaction });

    if (req.body.items && req.body.items.length > 0) {
      await SrvItem.bulkCreate(
        req.body.items.map(item => ({
          srvId: srv.id,
          productId: item.productId,
          quantity: item.quantity,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          unitCost: item.unitCost,
          authadd: req.user.id,
        })),
        { transaction }
      );
    }
    return srv;
  });

  const srv = await Srv.findOne({
    where: { id: created.id },
    include: [{ model: Supplier }, { model: SrvItem, include: [Product] }],
  });
  res.status(201).json(srv);
});

export const updateSrv = asyncHandler(async (req, res) => {
  const updated = await sequelize.transaction(async (transaction) => {
    const srv = await Srv.findOne({
      where: { id: req.params.id, detstatus: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!srv) throw Object.assign(new Error('SRV not found'), { status: 404 });
    if (srv.status !== 'Draft') {
      throw Object.assign(new Error('Only Draft SRVs can be modified'), { status: 400 });
    }

    await srv.update({
      srvDate: req.body.srvDate || srv.srvDate,
      supplierId: req.body.supplierId !== undefined ? req.body.supplierId : srv.supplierId,
      supplierInvoiceNo: req.body.supplierInvoiceNo !== undefined ? req.body.supplierInvoiceNo : srv.supplierInvoiceNo,
      supplierInvoiceDate: req.body.supplierInvoiceDate !== undefined ? req.body.supplierInvoiceDate : srv.supplierInvoiceDate,
      transporter: req.body.transporter !== undefined ? req.body.transporter : srv.transporter,
      vehicleNo: req.body.vehicleNo !== undefined ? req.body.vehicleNo : srv.vehicleNo,
      lrNumber: req.body.lrNumber !== undefined ? req.body.lrNumber : srv.lrNumber,
      remarks: req.body.remarks !== undefined ? req.body.remarks : srv.remarks,
      authlstedit: req.user.id,
    }, { transaction });

    if (req.body.items) {
      await SrvItem.destroy({ where: { srvId: srv.id }, transaction });
      await SrvItem.bulkCreate(
        req.body.items.map(item => ({
          srvId: srv.id,
          productId: item.productId,
          quantity: item.quantity,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          unitCost: item.unitCost,
          authadd: req.user.id,
        })),
        { transaction }
      );
    }
    return srv;
  });
  const srv = await Srv.findOne({
    where: { id: updated.id },
    include: [{ model: Supplier }, { model: SrvItem, include: [Product] }],
  });
  res.json(srv);
});

export const confirmSrv = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const srv = await Srv.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [SrvItem],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!srv) throw Object.assign(new Error('SRV not found'), { status: 404 });
    if (srv.status !== 'Draft') {
      throw Object.assign(new Error(`Cannot confirm SRV in status ${srv.status}`), { status: 400 });
    }

    for (const item of srv.SrvItems) {
      let batchId = null;
      if (item.batchNumber) {
        const [batch] = await ProductBatch.findOrCreate({
          where: {
            productId: item.productId,
            branchId: srv.branchId,
            batchNumber: item.batchNumber,
            detstatus: false,
          },
          defaults: {
            expiryDate: item.expiryDate || null,
            quantity: 0,
            authadd: req.user.id,
          },
          transaction
        });
        batchId = batch.id;
        await item.update({ batchId }, { transaction });
      }

      await postStockTransaction({
        productId: item.productId,
        branchId: srv.branchId,
        quantity: item.quantity,
        movementType: 'GRN', // Or 'SRV' if added to stock movement types
        referenceType: 'SRV',
        referenceId: srv.id,
        referenceNumber: srv.srvNumber,
        batchId,
        unitCost: item.unitCost,
        transactionDate: srv.srvDate,
        notes: `Received via SRV ${srv.srvNumber}`,
        transaction,
        userId: req.user.id,
      });
    }

    await srv.update({
      status: 'Posted',
      receivedBy: req.user.id,
      postedAt: new Date(),
      authlstedit: req.user.id,
    }, { transaction });
  });

  const updated = await Srv.findOne({
    where: { id: req.params.id },
    include: [{ model: Supplier }, { model: SrvItem, include: [Product] }],
  });
  res.json(updated);
});

export const removeSrv = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const srv = await Srv.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [SrvItem],
      transaction,
    });
    if (!srv) throw Object.assign(new Error('SRV not found'), { status: 404 });
    if (srv.status === 'Posted') {
      throw Object.assign(new Error('Cannot delete a Posted SRV. It must be cancelled or reversed.'), { status: 400 });
    }

    await srv.update({ detstatus: true, authdel: req.user.id, delondt: new Date(), status: 'Cancelled' }, { transaction });
  });
  res.json({ message: 'SRV deleted successfully' });
});
