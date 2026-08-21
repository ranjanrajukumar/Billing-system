import { Op } from 'sequelize';
import { ProductContainer } from '../models/index.js';
import { toStoredQty } from './uom.service.js';

/**
 * Physical vessels of loose stock.
 *
 * These rows are a *detail* of the location balance, never a second authority.
 * `branch_stock` says how much exists; this says which buckets it is sitting
 * in. Receiving a container does not add stock on its own and drawing from one
 * does not remove it — the stock engine does both, and these functions record
 * where it physically went or came from. Two tables that can each claim to be
 * right will eventually disagree, and then neither is believed.
 *
 * Consequently nothing here writes `branch_stock`, and the caller is expected
 * to have posted the corresponding stock movement inside the same transaction.
 */

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Registers a vessel as received, sealed and full. */
export async function receiveContainer({
  productId, branchId, ownerId = 1, containerCode, containerType = 'Bucket',
  capacityQty, batchId = null, supplierId = null, grnId = null, expiryDate = null,
  binId = null, notes = null, transaction = null, userId = null,
}) {
  const capacity = toStoredQty(capacityQty);
  if (!(capacity > 0)) {
    throw Object.assign(new Error('A container must be received with a quantity greater than zero'), { status: 400 });
  }

  const existing = await ProductContainer.findOne({
    where: { branchId, containerCode, detstatus: false },
    transaction,
  });
  if (existing) {
    throw Object.assign(
      new Error(`Container ${containerCode} already exists at this location`),
      { status: 409 },
    );
  }

  return ProductContainer.create({
    productId,
    branchId,
    ownerId,
    containerCode,
    containerType,
    capacityQty: capacity,
    remainingQty: capacity,
    status: 'Sealed',
    batchId,
    supplierId,
    grnId,
    expiryDate,
    binId,
    notes,
    receivedAt: new Date(),
    authadd: userId,
  }, { transaction });
}

/**
 * Breaks the seal.
 *
 * Worth its own event and its own timestamp: for most loose goods the usable
 * life starts when air reaches them, not when the pallet arrived, and an
 * auditor asking why a drum was written off wants the date it was opened.
 * Quantity does not change — opening a bucket does not create or destroy seed.
 */
export async function openContainer({ containerId, transaction = null, userId = null }) {
  const container = await ProductContainer.findByPk(containerId, {
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!container || container.detstatus) {
    throw Object.assign(new Error('Container not found'), { status: 404 });
  }
  if (container.status === 'Open') return container;
  if (container.status !== 'Sealed') {
    throw Object.assign(
      new Error(`Container ${container.containerCode} is ${container.status.toLowerCase()} and cannot be opened`),
      { status: 409 },
    );
  }

  await container.update({
    status: 'Open',
    openedAt: new Date(),
    openedBy: userId,
    authlstedit: userId,
  }, { transaction });

  return container;
}

/**
 * Takes a quantity out of open vessels, oldest first.
 *
 * Oldest-first because loose goods degrade and because a half-empty bucket left
 * behind while a fresh one is opened is how stock expires on a shelf. Spreads
 * across vessels when one cannot cover the draw, and refuses rather than going
 * negative — a bucket containing minus two kilos is not a thing.
 */
export async function drawFromContainers({
  productId, branchId, ownerId = 1, quantity, transaction = null, userId = null,
}) {
  const wanted = toStoredQty(quantity);
  if (!(wanted > 0)) return { drawn: 0, from: [] };

  const open = await ProductContainer.findAll({
    where: {
      productId, branchId, ownerId, detstatus: false,
      status: 'Open',
      remainingQty: { [Op.gt]: 0 },
    },
    // Oldest opened first; a vessel never opened has no date and sorts last.
    order: [['openedAt', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  const available = open.reduce((total, container) => total + num(container.remainingQty), 0);
  if (available < wanted) {
    throw Object.assign(
      new Error(
        `Open containers hold ${available} but ${wanted} was requested. `
        + 'Open another container first.',
      ),
      { status: 409 },
    );
  }

  let outstanding = wanted;
  const from = [];

  for (const container of open) {
    if (outstanding <= 0) break;
    const take = Math.min(num(container.remainingQty), outstanding);
    const remaining = toStoredQty(num(container.remainingQty) - take);

    await container.update({
      remainingQty: remaining,
      // An emptied vessel stops being a place to draw from, and the date it ran
      // out is what a returnable-container deposit is settled against.
      status: remaining <= 0 ? 'Empty' : 'Open',
      emptiedAt: remaining <= 0 ? new Date() : container.emptiedAt,
      authlstedit: userId,
    }, { transaction });

    from.push({ containerId: container.id, containerCode: container.containerCode, quantity: toStoredQty(take) });
    outstanding = toStoredQty(outstanding - take);
  }

  return { drawn: wanted, from };
}

/** Puts quantity back — a return, or a correction after a miscount. */
export async function returnToContainer({
  containerId, quantity, transaction = null, userId = null,
}) {
  const container = await ProductContainer.findByPk(containerId, {
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!container || container.detstatus) {
    throw Object.assign(new Error('Container not found'), { status: 404 });
  }

  const next = toStoredQty(num(container.remainingQty) + toStoredQty(quantity));
  if (next > num(container.capacityQty)) {
    throw Object.assign(
      new Error(`That would put ${next} into a container that holds ${container.capacityQty}`),
      { status: 400 },
    );
  }

  await container.update({
    remainingQty: next,
    status: next > 0 && container.status === 'Empty' ? 'Open' : container.status,
    authlstedit: userId,
  }, { transaction });

  return container;
}

/** What is physically on the shelf, vessel by vessel. */
export async function containersFor({ productId, branchId = null, status = null, ownerId = null }) {
  const where = { productId, detstatus: false };
  if (branchId) where.branchId = branchId;
  if (status) where.status = status;
  if (ownerId) where.ownerId = ownerId;

  const containers = await ProductContainer.findAll({
    where,
    order: [['status', 'ASC'], ['openedAt', 'ASC'], ['id', 'ASC']],
  });

  const summary = containers.reduce((totals, container) => {
    totals[container.status] = (totals[container.status] || 0) + 1;
    totals.remaining += num(container.remainingQty);
    return totals;
  }, { remaining: 0 });

  return { containers, summary };
}

/**
 * Whether the vessel detail still agrees with the location balance.
 *
 * Not called by the engine — it is a check somebody runs when a count comes out
 * wrong. A mismatch means stock moved without the vessels being updated, which
 * points at the path that did it.
 */
export async function reconcileContainers({ productId, branchId, ownerId = 1 }) {
  const { getBranchStock } = await import('./stock.service.js');
  const [balance, { summary }] = await Promise.all([
    getBranchStock(productId, branchId, null, ownerId, 0),
    containersFor({ productId, branchId, ownerId }),
  ]);

  const inContainers = toStoredQty(summary.remaining);
  return {
    locationBalance: toStoredQty(balance),
    inContainers,
    difference: toStoredQty(balance - inContainers),
    agrees: Math.abs(balance - inContainers) < 0.0001,
  };
}
