import { Op } from 'sequelize';
import {
  Branch, Product, ProductSerial, sequelize, StockTransfer, StockTransferItem, User,
} from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { withDateRange } from '../../utils/dateRange.js';
import { assertAvailable, postStockTransaction } from './stock.service.js';
import { cancelFor, isCleared, requestApproval } from '../platform/approval.service.js';
import { returnToBins } from '../warehouse/binStock.service.js';

/**
 * Stock transfers between locations.
 *
 * The workflow exists because stock in a lorry is not stock on a shelf. It
 * leaves the source at dispatch and arrives at the destination at receipt, and
 * in between it belongs to neither — so a branch manager looking at their
 * screen sees what they can actually sell, not what is notionally theirs.
 */

const ITEM_INCLUDE = { model: StockTransferItem, include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'purchasePrice'] }] };
const LOCATION_ATTRS = ['id', 'branchName', 'branchCode', 'locationType'];

async function nextTransferNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await StockTransfer.count({
    where: { transferNumber: { [Op.like]: `TRF-${year}-%` } },
    transaction,
  });
  return `TRF-${year}-${String(count + 1).padStart(5, '0')}`;
}

async function loadTransfer(id, transaction, lock = false) {
  const transfer = await StockTransfer.findOne({
    where: { id, detstatus: false },
    include: [StockTransferItem],
    transaction,
    lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!transfer) throw Object.assign(new Error('Transfer not found'), { status: 404 });
  return transfer;
}

/** Refuses a status change the workflow does not allow. */
function assertStatus(transfer, allowed) {
  if (!allowed.includes(transfer.status)) {
    throw Object.assign(
      new Error(`A transfer that is ${transfer.status} cannot be ${allowed.length === 1 ? `moved on from ${allowed[0]}` : 'changed'} this way`),
      { status: 409 },
    );
  }
}

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange({ detstatus: false }, req.query, 'transferDate');

  if (req.query.status) where.status = req.query.status;
  // A location sees transfers it sends and transfers it is due to receive.
  if (req.branchScope) {
    where[Op.or] = [{ fromBranchId: req.branchScope }, { toBranchId: req.branchScope }];
  }
  if (req.query.direction === 'incoming') where.toBranchId = req.query.branchId || req.branchId;
  if (req.query.direction === 'outgoing') where.fromBranchId = req.query.branchId || req.branchId;

  const { rows, count } = await StockTransfer.findAndCountAll({
    where,
    distinct: true,
    include: [
      { model: Branch, as: 'fromBranch', attributes: LOCATION_ATTRS },
      { model: Branch, as: 'toBranch', attributes: LOCATION_ATTRS },
      ITEM_INCLUDE,
    ],
    limit,
    offset,
    order: [['transferDate', 'DESC'], ['id', 'DESC']],
  });

  res.json(paged(rows, count, page, limit));
});

export const getOne = asyncHandler(async (req, res) => {
  const transfer = await StockTransfer.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      { model: Branch, as: 'fromBranch', attributes: LOCATION_ATTRS },
      { model: Branch, as: 'toBranch', attributes: LOCATION_ATTRS },
      { model: User, as: 'requester', attributes: ['id', 'name'] },
      { model: User, as: 'approver', attributes: ['id', 'name'] },
      ITEM_INCLUDE,
    ],
  });
  if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
  res.json(transfer);
});

export const create = asyncHandler(async (req, res) => {
  const { items = [], ...data } = req.body;
  if (!items.length) return res.status(400).json({ message: 'Add at least one product to transfer' });

  const created = await sequelize.transaction(async (transaction) => {
    const fromBranchId = Number(data.fromBranchId || req.branchId);
    const toBranchId = Number(data.toBranchId);

    if (!toBranchId) throw Object.assign(new Error('Choose a destination location'), { status: 400 });
    if (fromBranchId === toBranchId) {
      throw Object.assign(new Error('Source and destination locations must differ'), { status: 400 });
    }

    for (const id of [fromBranchId, toBranchId]) {
      const location = await Branch.findOne({ where: { id, detstatus: false }, transaction });
      if (!location) throw Object.assign(new Error(`Location ${id} not found`), { status: 404 });
    }

    // Availability is a courtesy check at request time — what matters is that
    // the stock is there at dispatch, which is checked again then.
    await assertAvailable(items.map((i) => ({ productId: i.productId, quantity: i.quantity })), fromBranchId, transaction);

    const products = await Product.findAll({
      where: { id: items.map((i) => i.productId) },
      transaction,
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const totalQuantity = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    const totalValue = items.reduce((sum, i) => {
      const cost = Number(i.unitCost ?? byId.get(Number(i.productId))?.purchasePrice ?? 0);
      return sum + cost * Number(i.quantity || 0);
    }, 0);

    const transfer = await StockTransfer.create({
      transferNumber: data.transferNumber || await nextTransferNumber(transaction),
      transferDate: data.transferDate || new Date().toISOString().slice(0, 10),
      fromBranchId,
      toBranchId,
      status: data.status === 'Draft' ? 'Draft' : 'Pending',
      requestedBy: req.user.id,
      transporter: data.transporter || null,
      vehicleNo: data.vehicleNo || null,
      totalQuantity,
      totalValue,
      remarks: data.remarks || null,
      authadd: req.user.id,
    }, { transaction });

    await StockTransferItem.bulkCreate(items.map((item) => ({
      transferId: transfer.id,
      productId: item.productId,
      batchId: item.batchId || null,
      batchNumber: item.batchNumber || null,
      serialNumber: item.serialNumber || null,
      quantity: Number(item.quantity),
      unitCost: item.unitCost ?? byId.get(Number(item.productId))?.purchasePrice ?? null,
      um: item.um || byId.get(Number(item.productId))?.primaryUnit || null,
      remarks: item.remarks || null,
      authadd: req.user.id,
    })), { transaction });

    // A large transfer may need signing off before anything moves.
    await requestApproval({
      documentType: 'StockTransfer',
      documentId: transfer.id,
      documentNumber: transfer.transferNumber,
      values: { quantity: totalQuantity, totalQuantity, grandTotal: totalValue },
      branchId: fromBranchId,
      userId: req.user.id,
      transaction,
    });

    return transfer;
  });

  res.status(201).json(await StockTransfer.findByPk(created.id, { include: [ITEM_INCLUDE] }));
});

export const approve = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const transfer = await loadTransfer(req.params.id, transaction, true);
    assertStatus(transfer, ['Draft', 'Pending']);

    await transfer.update({
      status: 'Approved',
      approvedBy: req.user.id,
      approvedAt: new Date(),
      authlstedit: req.user.id,
    }, { transaction });
    return transfer;
  });
  res.json(result);
});

export const reject = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const transfer = await loadTransfer(req.params.id, transaction, true);
    assertStatus(transfer, ['Draft', 'Pending', 'Approved']);

    await transfer.update({
      status: 'Rejected',
      rejectionReason: req.body.reason || null,
      authlstedit: req.user.id,
    }, { transaction });
    await cancelFor({ documentType: 'StockTransfer', documentId: transfer.id, userId: req.user.id, transaction });
    return transfer;
  });
  res.json(result);
});

/**
 * Marks the goods as picked without walking a pick list.
 *
 * The bin-aware route (`/warehouse-ops/transfers/:id/pick`) is the real one
 * where a location uses bins; this stays for locations that do not, and for
 * correcting a transfer whose picking was done on paper.
 */
export const pick = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const transfer = await loadTransfer(req.params.id, transaction, true);
    assertStatus(transfer, ['Approved']);

    for (const item of transfer.StockTransferItems) {
      await item.update({ pickedQty: Number(item.quantity), authlstedit: req.user.id }, { transaction });
    }
    await transfer.update({ status: 'Picked', authlstedit: req.user.id }, { transaction });
    return transfer;
  });
  res.json(result);
});

/**
 * Dispatch: stock leaves the source now.
 *
 * This is the point of no return for the sending location, so availability is
 * re-checked here rather than trusted from request time — hours may have passed
 * and the shelf may have been sold down in the meantime.
 */
export const dispatch = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const transfer = await loadTransfer(req.params.id, transaction, true);
    assertStatus(transfer, ['Approved', 'Picked']);

    if (!await isCleared({ documentType: 'StockTransfer', documentId: transfer.id, transaction })) {
      throw Object.assign(new Error('This transfer is still waiting for approval'), { status: 409 });
    }

    const lines = req.body.items || [];
    const dispatchedById = new Map(lines.map((l) => [Number(l.id), Number(l.dispatchedQty)]));

    for (const item of transfer.StockTransferItems) {
      const qty = dispatchedById.has(item.id) ? dispatchedById.get(item.id) : Number(item.quantity);
      if (qty <= 0) continue;
      if (qty > Number(item.quantity)) {
        throw Object.assign(
          new Error(`Cannot dispatch more than requested for product ${item.productId}`),
          { status: 400 },
        );
      }

      await assertAvailable([{ productId: item.productId, quantity: qty }], transfer.fromBranchId, transaction);

      await postStockTransaction({
        productId: item.productId,
        branchId: transfer.fromBranchId,
        quantity: -qty,
        movementType: 'Transfer Out',
        referenceType: 'Stock Transfer',
        referenceId: transfer.id,
        referenceNumber: transfer.transferNumber,
        batchId: item.batchId,
        serialNumber: item.serialNumber,
        unitCost: item.unitCost,
        notes: `Dispatched to location ${transfer.toBranchId} on ${transfer.transferNumber}`,
        transaction,
        userId: req.user.id,
      });

      await item.update({ dispatchedQty: qty, authlstedit: req.user.id }, { transaction });
    }

    // Serials travel with the goods and belong to no location while in transit.
    const serials = transfer.StockTransferItems.map((i) => i.serialNumber).filter(Boolean);
    if (serials.length) {
      await ProductSerial.update(
        { status: 'In Transit', branchId: null, authlstedit: req.user.id },
        { where: { serialNumber: serials, branchId: transfer.fromBranchId, detstatus: false }, transaction },
      );
    }

    await transfer.update({
      status: 'InTransit',
      dispatchedBy: req.user.id,
      dispatchedAt: new Date(),
      transporter: req.body.transporter ?? transfer.transporter,
      vehicleNo: req.body.vehicleNo ?? transfer.vehicleNo,
      authlstedit: req.user.id,
    }, { transaction });

    return transfer;
  });

  res.json(await StockTransfer.findByPk(result.id, { include: [ITEM_INCLUDE] }));
});

/**
 * Receipt: stock arrives at the destination.
 *
 * A short receipt leaves the transfer PartiallyReceived rather than quietly
 * closing it — the missing units are a real question for somebody, and the
 * status is what asks it.
 */
export const receive = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const transfer = await loadTransfer(req.params.id, transaction, true);
    assertStatus(transfer, ['InTransit', 'Dispatched', 'PartiallyReceived']);

    const lines = req.body.items || [];
    const byId = new Map(lines.map((l) => [Number(l.id), l]));

    for (const item of transfer.StockTransferItems) {
      const line = byId.get(item.id);
      const alreadyReceived = Number(item.receivedQty || 0);
      const outstanding = Number(item.dispatchedQty || 0) - alreadyReceived;
      if (outstanding <= 0) continue;

      const qty = line ? Number(line.receivedQty ?? outstanding) : outstanding;
      const damaged = line ? Number(line.damagedQty || 0) : 0;

      if (qty + damaged > outstanding + 0.001) {
        throw Object.assign(
          new Error(`Cannot receive more than was dispatched for product ${item.productId}`),
          { status: 400 },
        );
      }

      if (qty > 0) {
        await postStockTransaction({
          productId: item.productId,
          branchId: transfer.toBranchId,
          quantity: qty,
          movementType: 'Transfer In',
          referenceType: 'Stock Transfer',
          referenceId: transfer.id,
          referenceNumber: transfer.transferNumber,
          batchId: item.batchId,
          serialNumber: item.serialNumber,
          unitCost: item.unitCost,
          notes: `Received from location ${transfer.fromBranchId} on ${transfer.transferNumber}`,
          transaction,
          userId: req.user.id,
        });
      }

      // Damage in transit is a real loss, written off at the receiving end so
      // it shows up against the location that found it.
      if (damaged > 0) {
        await postStockTransaction({
          productId: item.productId,
          branchId: transfer.toBranchId,
          quantity: damaged,
          movementType: 'Transfer In',
          referenceType: 'Stock Transfer',
          referenceId: transfer.id,
          referenceNumber: transfer.transferNumber,
          notes: 'Damaged in transit — received then written off',
          transaction,
          userId: req.user.id,
        });
        await postStockTransaction({
          productId: item.productId,
          branchId: transfer.toBranchId,
          quantity: -damaged,
          movementType: 'Damage',
          referenceType: 'Stock Transfer',
          referenceId: transfer.id,
          referenceNumber: transfer.transferNumber,
          notes: `Damaged in transit on ${transfer.transferNumber}`,
          transaction,
          userId: req.user.id,
        });
      }

      await item.update({
        receivedQty: alreadyReceived + qty,
        damagedQty: Number(item.damagedQty || 0) + damaged,
        authlstedit: req.user.id,
      }, { transaction });
    }

    await transfer.reload({ include: [StockTransferItem], transaction });
    const fullyReceived = transfer.StockTransferItems.every(
      (item) => Number(item.receivedQty) + Number(item.damagedQty) >= Number(item.dispatchedQty) - 0.001,
    );

    // Serials now live at the destination.
    const serials = transfer.StockTransferItems.map((i) => i.serialNumber).filter(Boolean);
    if (serials.length) {
      await ProductSerial.update(
        { status: 'In Stock', branchId: transfer.toBranchId, authlstedit: req.user.id },
        { where: { serialNumber: serials, status: 'In Transit', detstatus: false }, transaction },
      );
    }

    await transfer.update({
      status: fullyReceived ? 'Received' : 'PartiallyReceived',
      receivedBy: req.user.id,
      receivedAt: new Date(),
      authlstedit: req.user.id,
    }, { transaction });

    return transfer;
  });

  res.json(await StockTransfer.findByPk(result.id, { include: [ITEM_INCLUDE] }));
});

/**
 * Cancels a transfer. Once stock has left the source it is put back, because
 * cancelling a dispatch that already moved goods would otherwise lose them.
 */
export const cancel = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const transfer = await loadTransfer(req.params.id, transaction, true);
    if (['Received', 'Cancelled'].includes(transfer.status)) {
      throw Object.assign(new Error(`A ${transfer.status.toLowerCase()} transfer cannot be cancelled`), { status: 409 });
    }

    // Stock picked but never dispatched is still in the building, on the
    // packing bench. Cancelling has to put it back on its shelf, or the bins
    // permanently understate what the location is holding.
    for (const item of transfer.StockTransferItems) {
      const onBench = Number(item.pickedQty || 0) - Number(item.dispatchedQty || 0);
      const takenFrom = item.pickedFrom || [];
      if (onBench <= 0 || !takenFrom.length) continue;

      // Back to the exact bins it was taken from. Only the portion still on the
      // bench goes back — anything already dispatched has left the building and
      // is handled by the stock reversal below.
      let remaining = onBench;
      const returning = [];
      for (const allocation of takenFrom) {
        if (remaining <= 0) break;
        const amount = Math.min(Number(allocation.quantity), remaining);
        returning.push({ ...allocation, pick: amount });
        remaining -= amount;
      }

      await returnToBins({
        branchId: transfer.fromBranchId,
        productId: item.productId,
        picks: returning,
        transaction,
        userId: req.user.id,
      });
      await item.update({
        pickedQty: Number(item.dispatchedQty || 0),
        pickedFrom: [],
      }, { transaction });
    }

    for (const item of transfer.StockTransferItems) {
      const inTransit = Number(item.dispatchedQty || 0) - Number(item.receivedQty || 0) - Number(item.damagedQty || 0);
      if (inTransit <= 0) continue;

      await postStockTransaction({
        productId: item.productId,
        branchId: transfer.fromBranchId,
        quantity: inTransit,
        movementType: 'Transfer In',
        referenceType: 'Transfer Cancellation',
        referenceId: transfer.id,
        referenceNumber: transfer.transferNumber,
        batchId: item.batchId,
        unitCost: item.unitCost,
        notes: `Returned to source: ${transfer.transferNumber} cancelled`,
        transaction,
        userId: req.user.id,
      });
    }

    const serials = transfer.StockTransferItems.map((i) => i.serialNumber).filter(Boolean);
    if (serials.length) {
      await ProductSerial.update(
        { status: 'In Stock', branchId: transfer.fromBranchId, authlstedit: req.user.id },
        { where: { serialNumber: serials, status: 'In Transit', detstatus: false }, transaction },
      );
    }

    await cancelFor({ documentType: 'StockTransfer', documentId: transfer.id, userId: req.user.id, transaction });
    await transfer.update({
      status: 'Cancelled',
      rejectionReason: req.body.reason || null,
      authlstedit: req.user.id,
    }, { transaction });
  });

  res.json({ message: 'Transfer cancelled and any dispatched stock returned to source' });
});
