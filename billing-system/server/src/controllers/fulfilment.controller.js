import { Op } from 'sequelize';
import {
  Customer, PackingSlip, PackingSlipItem, Product, ProductBatch,
  SalesOrder, SalesOrderItem, sequelize,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { scopedWhere } from '../middleware/branchContext.js';
import { pick, returnToBins, suggestPick, usesBins } from '../services/binStock.service.js';
import { getBranchStock, postStockTransaction } from '../services/stock.service.js';
import { deriveStatus, progressOf, remainingOn } from '../services/fulfilment.service.js';

/**
 * Fulfilling a sales order: allocate → pick → pack → dispatch.
 *
 * Location stock moves exactly once, at dispatch. Allocation sets goods aside,
 * picking takes them off the shelf and packing puts them in a box — all of
 * which happen inside the building, so the shelf figure must not change.
 */

const ITEM_INCLUDE = {
  model: SalesOrderItem,
  include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit'] }],
};

async function nextPackageNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await PackingSlip.count({
    where: { packageNumber: { [Op.like]: `PKG-${year}-%` } },
    transaction,
  });
  return `PKG-${year}-${String(count + 1).padStart(5, '0')}`;
}

async function loadOrder(id, transaction, lock = false) {
  const order = await SalesOrder.findOne({
    where: { id, detstatus: false },
    include: [SalesOrderItem],
    transaction,
    lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!order) throw Object.assign(new Error('Sales order not found'), { status: 404 });
  return order;
}

/** Recomputes the order's fulfilment state from its lines. */
async function refreshStatus(order, transaction) {
  await order.reload({ include: [SalesOrderItem], transaction });
  const next = deriveStatus(order, order.SalesOrderItems);
  if (next !== order.fulfilmentStatus) {
    await order.update({ fulfilmentStatus: next }, { transaction });
  }
  return next;
}

/** Orders waiting on the warehouse, newest commitments first. */
export const queue = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = scopedWhere(req, { detstatus: false });
  where.fulfilmentStatus = req.query.status
    ? req.query.status
    : { [Op.in]: ['Pending', 'Allocated', 'Picking', 'Picked', 'Packed', 'ReadyToShip'] };

  // The warehouse floor asks "what is *this* location shipping?", which is the
  // fulfilling location — not `branchId`, which records where the order was
  // taken. An order raised at the shop counter and shipped from the warehouse
  // has to appear on the warehouse's list, not the shop's.
  //
  // Orders nobody has allocated yet belong to no location, so they stay visible
  // everywhere until allocation claims them for one.
  if (req.query.fulfilFromBranchId) {
    where.fulfilFromBranchId = { [Op.or]: [Number(req.query.fulfilFromBranchId), null] };
  }

  const { rows, count } = await SalesOrder.findAndCountAll({
    where,
    distinct: true,
    include: [{ model: Customer, attributes: ['id', 'customerName'] }, ITEM_INCLUDE],
    limit,
    offset,
    order: [['orderDate', 'ASC'], ['id', 'ASC']],
  });

  res.json(paged(
    rows.map((order) => ({
      ...order.toJSON(),
      progress: progressOf(order.SalesOrderItems || []),
    })),
    count, page, limit,
  ));
});

/**
 * Allocation: sets stock aside for this order.
 *
 * Nothing physical happens — the goods stay where they are. What changes is
 * that they are now spoken for, which is what stops two orders promising the
 * same last box to two customers.
 */
export const allocate = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const order = await loadOrder(req.params.id, transaction, true);
    if (['Dispatched', 'InTransit', 'Delivered', 'Cancelled'].includes(order.fulfilmentStatus)) {
      throw Object.assign(
        new Error(`A ${order.fulfilmentStatus} order cannot be allocated`),
        { status: 409 },
      );
    }

    const branchId = Number(req.body.branchId || order.fulfilFromBranchId || req.branchId);
    const shortfalls = [];

    for (const item of order.SalesOrderItems) {
      const { toAllocate } = remainingOn(item);
      if (toAllocate <= 0) continue;

      // Only what is genuinely free: stock already allocated to other orders at
      // this location is not available to promise again.
      const onHand = await getBranchStock(item.productId, branchId, transaction);
      const spokenFor = await SalesOrderItem.sum('allocatedQty', {
        where: { productId: item.productId, id: { [Op.ne]: item.id } },
        include: [{
          model: SalesOrder,
          attributes: [],
          required: true,
          where: {
            detstatus: false,
            fulfilFromBranchId: branchId,
            fulfilmentStatus: { [Op.in]: ['Allocated', 'Picking', 'Picked', 'Packed', 'ReadyToShip'] },
          },
        }],
        transaction,
      });

      const free = Math.max(0, Number(onHand) - Number(spokenFor || 0));
      const take = Math.min(toAllocate, free);

      if (take > 0) {
        await item.update({
          allocatedQty: Number(item.allocatedQty) + take,
          authlstedit: req.user.id,
        }, { transaction });
      }
      if (take < toAllocate) {
        const product = await Product.findByPk(item.productId, { transaction });
        shortfalls.push({
          productId: item.productId,
          productName: product?.productName,
          wanted: toAllocate,
          allocated: take,
          short: toAllocate - take,
        });
      }
    }

    await order.update({ fulfilFromBranchId: branchId, authlstedit: req.user.id }, { transaction });
    await refreshStatus(order, transaction);
    return { order, shortfalls };
  });

  res.json({
    // A partial allocation is normal and worth saying plainly, rather than
    // reporting success and leaving somebody to notice the gap at picking.
    message: result.shortfalls.length
      ? `Allocated what was available; ${result.shortfalls.length} line(s) are short`
      : 'Fully allocated',
    shortfalls: result.shortfalls,
    order: await SalesOrder.findByPk(result.order.id, { include: [ITEM_INCLUDE] }),
  });
});

/** The pick list: which bin to walk to for each line, oldest lot first. */
export const pickList = asyncHandler(async (req, res) => {
  const order = await SalesOrder.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: Customer, attributes: ['id', 'customerName'] }, ITEM_INCLUDE],
  });
  if (!order) return res.status(404).json({ message: 'Sales order not found' });

  const branchId = order.fulfilFromBranchId || req.branchId;
  const binsInUse = await usesBins(branchId);
  const lines = [];

  for (const item of order.SalesOrderItems) {
    const { toPick } = remainingOn(item);
    const suggestion = binsInUse && toPick > 0
      ? await suggestPick({ branchId, productId: item.productId, quantity: toPick })
      : { picks: [], shortfall: 0, complete: true };

    lines.push({
      itemId: item.id,
      productId: item.productId,
      productName: item.Product?.productName,
      sku: item.Product?.sku,
      unit: item.Product?.primaryUnit,
      ordered: Number(item.quantity),
      allocated: Number(item.allocatedQty),
      alreadyPicked: Number(item.pickedQty),
      toPick,
      ...suggestion,
    });
  }

  res.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    customer: order.Customer?.customerName,
    fulfilmentStatus: order.fulfilmentStatus,
    branchId,
    binsInUse,
    lines,
    note: binsInUse
      ? null
      : 'This location does not use bins, so there is nothing to walk to — confirm to mark the lines picked.',
  });
});

/** Confirms a pick: stock comes off the shelves onto the packing bench. */
export const confirmPick = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const order = await loadOrder(req.params.id, transaction, true);
    const branchId = order.fulfilFromBranchId || req.branchId;
    const binsInUse = await usesBins(branchId, transaction);
    const byItem = new Map((req.body.lines || []).map((l) => [Number(l.itemId), l]));

    for (const item of order.SalesOrderItems) {
      const { toPick } = remainingOn(item);
      if (toPick <= 0) continue;
      const line = byItem.get(item.id);

      if (binsInUse && line?.picks?.length) {
        const { picked } = await pick({
          branchId,
          productId: item.productId,
          picks: line.picks,
          transaction,
          userId: req.user.id,
        });

        const taken = line.picks
          .filter((p) => Number(p.pick ?? p.quantity) > 0)
          .map((p) => ({
            binId: Number(p.binId),
            batchId: p.batchId ? Number(p.batchId) : null,
            quantity: Number(p.pick ?? p.quantity),
          }));

        await item.update({
          pickedQty: Number(item.pickedQty) + picked,
          pickedFrom: [...(item.pickedFrom || []), ...taken],
          authlstedit: req.user.id,
        }, { transaction });
      } else if (!binsInUse) {
        await item.update({
          pickedQty: Number(item.allocatedQty),
          authlstedit: req.user.id,
        }, { transaction });
      }
    }

    const status = await refreshStatus(order, transaction);
    return { order, status };
  });

  res.json({
    message: result.status === 'Picked' ? 'Everything picked — ready to pack' : 'Partly picked',
    order: await SalesOrder.findByPk(result.order.id, { include: [ITEM_INCLUDE] }),
  });
});

/** Packages made up for an order. */
export const packages = asyncHandler(async (req, res) => {
  const rows = await PackingSlip.findAll({
    where: { referenceType: 'SalesOrder', referenceId: req.params.id, detstatus: false },
    include: [{
      model: PackingSlipItem,
      include: [
        { model: Product, attributes: ['id', 'productName', 'sku'] },
        { model: ProductBatch, attributes: ['id', 'batchNumber'], required: false },
      ],
    }],
    order: [['id', 'ASC']],
  });
  res.json(rows);
});

/** Packs picked goods into a carton. */
export const packCarton = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const order = await loadOrder(req.params.id, transaction, true);
    const byItem = new Map(order.SalesOrderItems.map((i) => [i.id, i]));

    const slip = await PackingSlip.create({
      packageNumber: await nextPackageNumber(transaction),
      referenceType: 'SalesOrder',
      referenceId: order.id,
      branchId: order.fulfilFromBranchId || req.branchId,
      status: req.body.seal === false ? 'Open' : 'Sealed',
      packageType: req.body.packageType || 'Carton',
      weightKg: req.body.weightKg || null,
      packedBy: req.user.id,
      packedAt: new Date(),
      remarks: req.body.remarks || null,
      authadd: req.user.id,
    }, { transaction });

    for (const line of req.body.items || []) {
      const amount = Number(line.quantity);
      if (!(amount > 0)) continue;

      const item = byItem.get(Number(line.itemId));
      if (!item) continue;

      const { toPack } = remainingOn(item);
      if (amount > toPack + 0.001) {
        throw Object.assign(
          new Error(`Cannot pack ${amount} — only ${toPack} has been picked for that line`),
          { status: 400 },
        );
      }

      await PackingSlipItem.create({
        packageId: slip.id,
        productId: item.productId,
        batchId: line.batchId || null,
        serialNumber: line.serialNumber || null,
        quantity: amount,
        authadd: req.user.id,
      }, { transaction });

      await item.update({
        packedQty: Number(item.packedQty) + amount,
        authlstedit: req.user.id,
      }, { transaction });
    }

    await refreshStatus(order, transaction);
    return slip;
  });

  res.status(201).json(await PackingSlip.findByPk(created.id, { include: [PackingSlipItem] }));
});

/**
 * Dispatch: the goods leave the building, and only now does location stock
 * fall. Records the courier and tracking number, which is what turns "gone"
 * into something a customer can be told.
 */
export const dispatch = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const order = await loadOrder(req.params.id, transaction, true);
    if (['Dispatched', 'InTransit', 'Delivered'].includes(order.fulfilmentStatus)) {
      throw Object.assign(new Error('This order has already been dispatched'), { status: 409 });
    }

    const branchId = order.fulfilFromBranchId || req.branchId;
    let moved = 0;

    for (const item of order.SalesOrderItems) {
      const { toDispatch } = remainingOn(item);
      if (toDispatch <= 0) continue;

      await postStockTransaction({
        productId: item.productId,
        branchId,
        quantity: -toDispatch,
        movementType: 'Sale',
        referenceType: 'Sales Order',
        referenceId: order.id,
        referenceNumber: order.orderNumber,
        notes: `Dispatched on ${order.orderNumber}`,
        transaction,
        userId: req.user.id,
      });

      await item.update({
        dispatchedQty: Number(item.dispatchedQty) + toDispatch,
        authlstedit: req.user.id,
      }, { transaction });
      moved += toDispatch;
    }

    if (moved === 0) {
      throw Object.assign(
        new Error('Nothing has been packed yet, so there is nothing to dispatch'),
        { status: 409 },
      );
    }

    await PackingSlip.update(
      { status: 'Dispatched', authlstedit: req.user.id },
      { where: { referenceType: 'SalesOrder', referenceId: order.id, status: 'Sealed' }, transaction },
    );

    await order.update({
      fulfilmentStatus: 'Dispatched',
      status: 'Shipped',
      courier: req.body.courier || null,
      trackingNumber: req.body.trackingNumber || null,
      dispatchedAt: new Date(),
      authlstedit: req.user.id,
    }, { transaction });

    return { order, moved };
  });

  res.json({
    message: `Dispatched ${result.moved} unit(s)`,
    order: await SalesOrder.findByPk(result.order.id, { include: [ITEM_INCLUDE] }),
  });
});

/** Marks a dispatched order as in transit or delivered. */
export const updateShipping = asyncHandler(async (req, res) => {
  const order = await SalesOrder.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!order) return res.status(404).json({ message: 'Sales order not found' });

  const next = req.body.status;
  if (!['InTransit', 'Delivered'].includes(next)) {
    return res.status(400).json({ message: 'Shipping status must be InTransit or Delivered' });
  }
  if (!['Dispatched', 'InTransit'].includes(order.fulfilmentStatus)) {
    return res.status(409).json({ message: 'Dispatch the order before tracking its delivery' });
  }

  await order.update({
    fulfilmentStatus: next,
    status: next === 'Delivered' ? 'Delivered' : order.status,
    deliveredAt: next === 'Delivered' ? new Date() : null,
    courier: req.body.courier ?? order.courier,
    trackingNumber: req.body.trackingNumber ?? order.trackingNumber,
    authlstedit: req.user.id,
  });

  res.json(order);
});

/**
 * Cancels fulfilment. Anything picked but not dispatched goes back on its
 * shelf; anything already gone has to come back as a sales return instead.
 */
export const cancelFulfilment = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const order = await loadOrder(req.params.id, transaction, true);
    if (['Dispatched', 'InTransit', 'Delivered'].includes(order.fulfilmentStatus)) {
      throw Object.assign(
        new Error('These goods have left the building — raise a sales return instead'),
        { status: 409 },
      );
    }

    const branchId = order.fulfilFromBranchId || req.branchId;

    for (const item of order.SalesOrderItems) {
      const onBench = Number(item.pickedQty) - Number(item.dispatchedQty);
      const takenFrom = item.pickedFrom || [];

      if (onBench > 0 && takenFrom.length) {
        let remaining = onBench;
        const returning = [];
        for (const allocation of takenFrom) {
          if (remaining <= 0) break;
          const amount = Math.min(Number(allocation.quantity), remaining);
          returning.push({ ...allocation, pick: amount });
          remaining -= amount;
        }
        await returnToBins({
          branchId,
          productId: item.productId,
          picks: returning,
          transaction,
          userId: req.user.id,
        });
      }

      await item.update({
        allocatedQty: 0, pickedQty: 0, packedQty: 0, pickedFrom: [],
        authlstedit: req.user.id,
      }, { transaction });
    }

    await PackingSlip.update(
      { status: 'Cancelled', authlstedit: req.user.id },
      { where: { referenceType: 'SalesOrder', referenceId: order.id, detstatus: false }, transaction },
    );

    await order.update({
      fulfilmentStatus: 'Cancelled',
      authlstedit: req.user.id,
    }, { transaction });
  });

  res.json({ message: 'Fulfilment cancelled and picked stock returned to its bins' });
});
