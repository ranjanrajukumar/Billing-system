import { Op } from 'sequelize';
import {
  BinStock, Grn, GrnItem, PackingSlip, PackingSlipItem, Product, ProductBatch,
  PutAwayRule, sequelize, StockTransfer, StockTransferItem, WarehouseBin,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  binContents, binOccupancy, locateProduct, moveBetweenBins, pick, putAway,
  putAwayQueue, reconcileBins, replenishmentSuggestions, suggestPick,
  suggestPutAway, unassignedQty, usesBins,
} from '../services/binStock.service.js';
import { MATCH_TYPES } from '../models/putAwayRule.model.js';

/** Storage classes a put-away rule can sort on. */
export const STORAGE_CLASSES = ['Standard', 'FastMoving', 'Heavy', 'Cold', 'Hazardous', 'Fragile'];

/**
 * Warehouse floor operations: put-away, picking and packing.
 *
 * All three are movements *inside* a location, so none of them touches the
 * location's stock total — goods only enter on a receipt and leave on a
 * dispatch, which the stock engine already owns. That boundary is what lets a
 * business adopt bins gradually, or never.
 */

async function nextPackageNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await PackingSlip.count({
    where: { packageNumber: { [Op.like]: `PKG-${year}-%` } },
    transaction,
  });
  return `PKG-${year}-${String(count + 1).padStart(5, '0')}`;
}

const scopeOf = (req) => Number(req.query.branchId || req.branchScope || req.branchId);

// ---------------------------------------------------------------------------
// Put-away
// ---------------------------------------------------------------------------

/** What has arrived but is not yet on a shelf. */
export const queue = asyncHandler(async (req, res) => {
  const branchId = scopeOf(req);
  res.json({
    branchId,
    binsInUse: await usesBins(branchId),
    items: await putAwayQueue(branchId),
  });
});

/** Places received stock into a bin. */
export const putAwayStock = asyncHandler(async (req, res) => {
  const branchId = Number(req.body.branchId || scopeOf(req));

  const result = await sequelize.transaction(async (transaction) => {
    const lines = Array.isArray(req.body.items) ? req.body.items : [req.body];
    const placed = [];

    for (const line of lines) {
      placed.push(await putAway({
        branchId,
        binId: Number(line.binId),
        productId: Number(line.productId),
        batchId: line.batchId ? Number(line.batchId) : null,
        quantity: line.quantity,
        transaction,
        userId: req.user.id,
      }));
    }
    return placed;
  });

  const overfilled = result.filter((r) => r.overCapacity).map((r) => r.binCode);
  res.status(201).json({
    placed: result,
    // Advisory rather than blocking: a full bin is a warehouse problem to
    // solve, not a reason to stop the goods being recorded where they are.
    warning: overfilled.length
      ? `Bin ${overfilled.join(', ')} is now over its stated capacity`
      : null,
  });
});

/** Suggests where to put a receipt away, bin by bin. */
export const putAwayForGrn = asyncHandler(async (req, res) => {
  const grn = await Grn.findOne({
    where: { id: req.params.grnId, detstatus: false },
    include: [{ model: GrnItem, include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit'] }] }],
  });
  if (!grn) return res.status(404).json({ message: 'GRN not found' });
  if (!grn.postedAt) {
    return res.status(409).json({ message: 'Post this receipt to stock before putting it away' });
  }

  const bins = await WarehouseBin.findAll({
    where: { branchId: grn.branchId, detstatus: false, isActive: true },
    order: [['code', 'ASC']],
  });

  const items = [];
  for (const item of grn.GrnItems) {
    if (!(Number(item.acceptedQty) > 0)) continue;
    items.push({
      productId: item.productId,
      productName: item.Product?.productName,
      sku: item.Product?.sku,
      accepted: Number(item.acceptedQty),
      // Only what is genuinely still loose, so re-opening the screen after a
      // partial put-away shows the remainder rather than the original figure.
      toPutAway: await unassignedQty(item.productId, grn.branchId),
      batchId: item.batchId,
      // Where this product already lives, so it goes back to the same place.
      suggestedBins: (await locateProduct(item.productId, grn.branchId))
        .map((row) => ({ binId: row.binId, binCode: row.WarehouseBin?.code, quantity: Number(row.quantity) })),
    });
  }

  res.json({
    grnId: grn.id,
    grnNumber: grn.grnNumber,
    branchId: grn.branchId,
    bins: bins.map((b) => ({ id: b.id, code: b.code, name: b.name, level: b.level })),
    items,
  });
});

// ---------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------

/**
 * The pick list for a transfer: which bin to take each line from, oldest lot
 * first so stock leaves in the order it will expire.
 */
export const pickList = asyncHandler(async (req, res) => {
  const transfer = await StockTransfer.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: StockTransferItem, include: [{ model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit'] }] }],
  });
  if (!transfer) return res.status(404).json({ message: 'Transfer not found' });

  const binsInUse = await usesBins(transfer.fromBranchId);
  const lines = [];

  for (const item of transfer.StockTransferItems) {
    const outstanding = Number(item.quantity) - Number(item.pickedQty || 0);
    const suggestion = binsInUse && outstanding > 0
      ? await suggestPick({
        branchId: transfer.fromBranchId,
        productId: item.productId,
        quantity: outstanding,
      })
      : { picks: [], shortfall: 0, complete: true };

    lines.push({
      itemId: item.id,
      productId: item.productId,
      productName: item.Product?.productName,
      sku: item.Product?.sku,
      unit: item.Product?.primaryUnit,
      required: Number(item.quantity),
      alreadyPicked: Number(item.pickedQty || 0),
      outstanding,
      ...suggestion,
    });
  }

  res.json({
    transferId: transfer.id,
    transferNumber: transfer.transferNumber,
    status: transfer.status,
    fromBranchId: transfer.fromBranchId,
    binsInUse,
    lines,
    // Without bins there is nothing to walk to, so picking is a formality that
    // simply marks the transfer ready to dispatch.
    note: binsInUse
      ? null
      : 'This location does not use bins, so there is nothing to pick from — confirm to mark the transfer ready.',
  });
});

/** Confirms a pick: stock comes off the shelves onto the packing bench. */
export const confirmPick = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const transfer = await StockTransfer.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [StockTransferItem],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!transfer) throw Object.assign(new Error('Transfer not found'), { status: 404 });
    if (!['Approved', 'Picked'].includes(transfer.status)) {
      throw Object.assign(
        new Error(`A transfer that is ${transfer.status} cannot be picked`),
        { status: 409 },
      );
    }

    const binsInUse = await usesBins(transfer.fromBranchId, transaction);
    const byItem = new Map((req.body.lines || []).map((l) => [Number(l.itemId), l]));

    for (const item of transfer.StockTransferItems) {
      const line = byItem.get(item.id);
      const outstanding = Number(item.quantity) - Number(item.pickedQty || 0);
      if (outstanding <= 0) continue;

      if (binsInUse && line?.picks?.length) {
        const { picked } = await pick({
          branchId: transfer.fromBranchId,
          productId: item.productId,
          picks: line.picks,
          transaction,
          userId: req.user.id,
        });

        // Remembered so a cancellation can put it back on the same shelf.
        const taken = line.picks
          .filter((p) => Number(p.pick ?? p.quantity) > 0)
          .map((p) => ({
            binId: Number(p.binId),
            batchId: p.batchId ? Number(p.batchId) : null,
            quantity: Number(p.pick ?? p.quantity),
          }));

        await item.update({
          pickedQty: Number(item.pickedQty || 0) + picked,
          pickedFrom: [...(item.pickedFrom || []), ...taken],
          authlstedit: req.user.id,
        }, { transaction });
      } else if (!binsInUse) {
        // No bins: picking records intent only, so the whole line is marked.
        await item.update({ pickedQty: Number(item.quantity), authlstedit: req.user.id }, { transaction });
      }
    }

    await transfer.reload({ include: [StockTransferItem], transaction });
    const fullyPicked = transfer.StockTransferItems.every(
      (item) => Number(item.pickedQty || 0) >= Number(item.quantity) - 0.001,
    );

    await transfer.update({
      status: fullyPicked ? 'Picked' : 'Approved',
      authlstedit: req.user.id,
    }, { transaction });

    return { transfer, fullyPicked };
  });

  res.json({
    message: result.fullyPicked
      ? 'Everything picked — ready to pack'
      : 'Partly picked; the rest is still on the shelves',
    transfer: await StockTransfer.findByPk(result.transfer.id, { include: [StockTransferItem] }),
  });
});

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

/** Packages already made up for a transfer. */
export const packages = asyncHandler(async (req, res) => {
  const rows = await PackingSlip.findAll({
    where: { referenceType: 'StockTransfer', referenceId: req.params.id, detstatus: false },
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

/** Makes up a carton from what has been picked. */
export const packCarton = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const transfer = await StockTransfer.findOne({
      where: { id: req.params.id, detstatus: false },
      transaction,
    });
    if (!transfer) throw Object.assign(new Error('Transfer not found'), { status: 404 });
    if (!['Picked', 'Approved'].includes(transfer.status)) {
      throw Object.assign(
        new Error(`Nothing to pack: this transfer is ${transfer.status}`),
        { status: 409 },
      );
    }

    const slip = await PackingSlip.create({
      packageNumber: await nextPackageNumber(transaction),
      referenceType: 'StockTransfer',
      referenceId: transfer.id,
      branchId: transfer.fromBranchId,
      status: req.body.seal === false ? 'Open' : 'Sealed',
      packageType: req.body.packageType || 'Carton',
      weightKg: req.body.weightKg || null,
      packedBy: req.user.id,
      packedAt: new Date(),
      remarks: req.body.remarks || null,
      authadd: req.user.id,
    }, { transaction });

    await PackingSlipItem.bulkCreate((req.body.items || [])
      .filter((item) => Number(item.quantity) > 0)
      .map((item) => ({
        packageId: slip.id,
        productId: Number(item.productId),
        batchId: item.batchId ? Number(item.batchId) : null,
        serialNumber: item.serialNumber || null,
        quantity: Number(item.quantity),
        authadd: req.user.id,
      })), { transaction });

    return slip;
  });

  res.status(201).json(await PackingSlip.findByPk(created.id, { include: [PackingSlipItem] }));
});

export const cancelPackage = asyncHandler(async (req, res) => {
  const slip = await PackingSlip.findOne({ where: { id: req.params.packageId, detstatus: false } });
  if (!slip) return res.status(404).json({ message: 'Package not found' });
  if (slip.status === 'Dispatched') {
    return res.status(409).json({ message: 'A dispatched package cannot be cancelled' });
  }
  await slip.update({ status: 'Cancelled', authlstedit: req.user.id });
  res.json(slip);
});

// ---------------------------------------------------------------------------
// Bin queries
// ---------------------------------------------------------------------------

export const contents = asyncHandler(async (req, res) => {
  res.json(await binContents(req.params.binId));
});

/** "Where is this product?" — the question a picker actually asks. */
export const locate = asyncHandler(async (req, res) => {
  const rows = await locateProduct(req.params.productId, req.query.branchId || null);
  res.json(rows.map((row) => ({
    binId: row.binId,
    binCode: row.WarehouseBin?.code,
    binName: row.WarehouseBin?.name,
    level: row.WarehouseBin?.level,
    branchId: row.branchId,
    batchNumber: row.ProductBatch?.batchNumber || null,
    expiryDate: row.ProductBatch?.expiryDate || null,
    quantity: Number(row.quantity),
  })));
});

export const move = asyncHandler(async (req, res) => {
  const branchId = Number(req.body.branchId || scopeOf(req));
  const result = await sequelize.transaction(async (transaction) => moveBetweenBins({
    branchId,
    fromBinId: Number(req.body.fromBinId),
    toBinId: Number(req.body.toBinId),
    productId: Number(req.body.productId),
    batchId: req.body.batchId ? Number(req.body.batchId) : null,
    quantity: req.body.quantity,
    transaction,
    userId: req.user.id,
  }));
  res.json({ message: `Moved ${result.moved} between bins`, ...result });
});

/** Binned quantities must never exceed what the location actually holds. */
export const reconcile = asyncHandler(async (req, res) => {
  res.json(await reconcileBins(req.query.branchId || req.branchScope || null));
});

// ---------------------------------------------------------------------------
// Put-away rules
// ---------------------------------------------------------------------------

export const listRules = asyncHandler(async (req, res) => {
  const where = { detstatus: false };
  if (req.query.branchId) {
    where[Op.or] = [{ branchId: null }, { branchId: req.query.branchId }];
  }

  res.json({
    rules: await PutAwayRule.findAll({
      where,
      include: [{ model: WarehouseBin, as: 'targetBin', attributes: ['id', 'code', 'name', 'level'] }],
      order: [['priority', 'ASC'], ['id', 'ASC']],
    }),
    matchTypes: MATCH_TYPES,
    // The classes a rule can sort on. Standard covers almost everything; the
    // rest exist because those goods genuinely cannot go just anywhere.
    storageClasses: STORAGE_CLASSES,
  });
});

/**
 * The fields a caller may set on a rule.
 *
 * A whitelist rather than a spread of the body: `detstatus` and the `auth*`
 * columns are the server's to write, and a request that sets them would delete
 * a rule or rewrite its audit trail through the edit endpoint.
 *
 * Only keys actually present are returned, so a partial update — the Active
 * toggle sends `isActive` alone — leaves everything else as it was.
 */
function ruleFields(body = {}) {
  const allowed = ['name', 'branchId', 'matchType', 'matchValue', 'targetBinId', 'priority', 'isActive', 'notes'];
  const out = {};
  for (const key of allowed) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  if (out.branchId !== undefined) out.branchId = out.branchId ? Number(out.branchId) : null;
  if (out.targetBinId !== undefined) out.targetBinId = Number(out.targetBinId);
  if (out.priority !== undefined) out.priority = Number(out.priority) || 100;
  if (out.matchValue !== undefined) out.matchValue = String(out.matchValue);
  return out;
}

/** A rule pointing at a bin that is not there would silently never fire. */
async function assertTargetBin(targetBinId) {
  const bin = await WarehouseBin.findOne({ where: { id: targetBinId, detstatus: false } });
  if (!bin) throw Object.assign(new Error('Target bin not found'), { status: 404 });
}

export const createRule = asyncHandler(async (req, res) => {
  const fields = ruleFields(req.body);
  if (!MATCH_TYPES.includes(fields.matchType)) {
    return res.status(400).json({ message: `Match type must be one of: ${MATCH_TYPES.join(', ')}` });
  }
  await assertTargetBin(fields.targetBinId);

  const rule = await PutAwayRule.create({ ...fields, authadd: req.user.id });
  res.status(201).json(rule);
});

export const updateRule = asyncHandler(async (req, res) => {
  const rule = await PutAwayRule.findOne({ where: { id: req.params.ruleId, detstatus: false } });
  if (!rule) return res.status(404).json({ message: 'Rule not found' });

  const fields = ruleFields(req.body);
  if (fields.matchType !== undefined && !MATCH_TYPES.includes(fields.matchType)) {
    return res.status(400).json({ message: `Match type must be one of: ${MATCH_TYPES.join(', ')}` });
  }
  if (fields.targetBinId !== undefined) await assertTargetBin(fields.targetBinId);

  await rule.update({ ...fields, authlstedit: req.user.id });
  res.json(rule);
});

export const removeRule = asyncHandler(async (req, res) => {
  const rule = await PutAwayRule.findOne({ where: { id: req.params.ruleId, detstatus: false } });
  if (!rule) return res.status(404).json({ message: 'Rule not found' });
  await rule.update({ detstatus: true, authdel: req.user.id, delondt: new Date() });
  res.status(204).send();
});

/** Where this product should go, best suggestion first and why. */
export const whereToPut = asyncHandler(async (req, res) => {
  res.json(await suggestPutAway({
    productId: Number(req.params.productId),
    branchId: scopeOf(req),
  }));
});

/** How full the warehouse is, bin by bin. */
export const occupancy = asyncHandler(async (req, res) => {
  res.json(await binOccupancy(scopeOf(req)));
});

/** Bins that are over capacity, and where there is room to move stock to. */
export const replenishment = asyncHandler(async (req, res) => {
  res.json(await replenishmentSuggestions(scopeOf(req)));
});

/**
 * The warehouse at a glance: what is waiting to be done, and how full it is.
 *
 * Assembled server-side because the alternative is five round trips before a
 * picker can see whether there is any work — and the answer is usually "no",
 * which should be cheap to get.
 */
export const overview = asyncHandler(async (req, res) => {
  const branchId = scopeOf(req);

  const [queueRows, occupancyStats, replenish, bins, transfers] = await Promise.all([
    putAwayQueue(branchId),
    binOccupancy(branchId),
    replenishmentSuggestions(branchId),
    WarehouseBin.count({ where: { branchId, detstatus: false, isActive: true } }),
    StockTransfer.findAll({
      where: {
        fromBranchId: branchId,
        detstatus: false,
        status: { [Op.in]: ['Approved', 'Picked'] },
      },
      attributes: ['id', 'transferNumber', 'status', 'transferDate', 'totalQuantity'],
      order: [['transferDate', 'ASC']],
    }),
  ]);

  res.json({
    branchId,
    binsInUse: bins > 0,
    tasks: {
      toPutAway: queueRows.length,
      toPick: transfers.filter((t) => t.status === 'Approved').length,
      toPack: transfers.filter((t) => t.status === 'Picked').length,
      toRebalance: replenish.overfull.length,
    },
    putAwayQueue: queueRows.slice(0, 10),
    transfers,
    occupancy: occupancyStats,
    replenishment: replenish,
  });
});
