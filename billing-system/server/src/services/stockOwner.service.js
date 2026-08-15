import { BranchStock, StockOwner } from '../models/index.js';
import { getConfig } from './config.service.js';

/**
 * Resolving whose stock a movement concerns.
 *
 * The rule everything here serves: a request that does not say whose goods it
 * is about means the house. That single default is what lets an ordinary shop
 * carry an ownership dimension it never asked for and never notices — every
 * existing call site keeps working, and its stock keeps landing in the same
 * balance it always did.
 *
 * A third-party warehouse is the case this exists for. There, client goods sit
 * in your building and must never be sellable, valued, or counted as yours; the
 * separation has to be structural rather than a report filter, because a filter
 * somebody forgets to apply is how a client's stock ends up on your balance
 * sheet.
 */

const HOUSE_CODE = 'HOUSE';

let cachedHouseId = null;

/** Forgets the cached house id. Called when owners are edited. */
export function clearOwnerCache() {
  cachedHouseId = null;
}

/**
 * The house owner, created if it is not there.
 *
 * Runs at boot before any stock is written, so the id every stock row defaults
 * to is guaranteed to exist by the time anything uses it.
 */
export async function ensureHouseOwner(transaction = undefined) {
  const [house] = await StockOwner.findOrCreate({
    where: { isHouse: true, detstatus: false },
    defaults: {
      ownerName: 'Own Stock',
      ownerCode: HOUSE_CODE,
      isHouse: true,
      isActive: true,
      notes: 'The company\'s own goods. Created automatically and cannot be removed.',
    },
    transaction,
  });
  cachedHouseId = house.id;
  return house;
}

/** The id every unattributed movement belongs to. */
export async function houseOwnerId(transaction = undefined) {
  if (cachedHouseId) return cachedHouseId;
  const house = await ensureHouseOwner(transaction);
  return house.id;
}

/** Whether this company holds goods for anyone but itself. */
export async function thirdPartyEnabled() {
  const { modules } = await getConfig();
  return modules.has('thirdParty');
}

/**
 * Turns whatever a caller supplied into an owner id.
 *
 * Naming an owner is refused outright when the module is off, rather than
 * quietly ignored: a request that asked for a client's stock and silently got
 * the house's would move the wrong goods and report success.
 */
export async function resolveOwnerId(requested, transaction = undefined) {
  if (requested === undefined || requested === null || requested === '') {
    return houseOwnerId(transaction);
  }

  const id = Number(requested);
  if (!Number.isFinite(id) || id <= 0) {
    throw Object.assign(new Error('Stock owner must be a valid id'), { status: 400 });
  }

  const house = await houseOwnerId(transaction);
  if (id === house) return house;

  if (!await thirdPartyEnabled()) {
    throw Object.assign(
      new Error('Third-party stock is not enabled — all stock belongs to this company'),
      { status: 403 },
    );
  }

  const owner = await StockOwner.findOne({
    where: { id, detstatus: false },
    transaction,
  });
  if (!owner) throw Object.assign(new Error('Stock owner not found'), { status: 404 });
  if (!owner.isActive) {
    throw Object.assign(
      new Error(`${owner.ownerName} is not active — reactivate the client before moving their stock`),
      { status: 409 },
    );
  }
  return owner.id;
}

/**
 * Refuses to move goods the company does not own.
 *
 * Used by selling and by anything that treats stock as an asset. A 3PL ships
 * client goods on the client's instruction and never sells them, so an invoice
 * drawing on a client's balance is always a mistake — usually somebody picking
 * the wrong location, which is exactly the mistake worth catching at the till
 * rather than in the accounts three weeks later.
 */
export async function assertHouseOwned(ownerId) {
  const house = await houseOwnerId();
  if (Number(ownerId) !== Number(house)) {
    const owner = await StockOwner.findByPk(ownerId);
    throw Object.assign(
      new Error(`These goods belong to ${owner?.ownerName || 'another company'} and cannot be sold — dispatch them on that client's order instead`),
      { status: 409 },
    );
  }
}

/** Owners holding anything at a location, for pickers and stock-take. */
export async function ownersAtLocation(branchId) {
  const rows = await BranchStock.findAll({
    where: { branchId, detstatus: false },
    include: [{ model: StockOwner, attributes: ['id', 'ownerName', 'ownerCode', 'isHouse'] }],
    attributes: ['ownerId'],
    group: ['ownerId', 'StockOwner.id'],
  });
  return rows.map((row) => row.StockOwner).filter(Boolean);
}
