/**
 * Order fulfilment: allocate → pick → pack → dispatch.
 *
 * The four quantities on a line are four different facts, and the whole point
 * of tracking them separately is being able to answer "where is this order"
 * precisely:
 *
 *   allocated   set aside for this order, still on the shelf
 *   picked      off the shelf, on the packing bench
 *   packed      in a box, still in the building
 *   dispatched  out of the door — and only this one reduces location stock
 *
 * Location stock therefore moves exactly once, at dispatch. Allocation and
 * picking rearrange things inside the building; treating either as a stock
 * movement would make the shelf figure disagree with the shelf.
 */

/** The order's state, derived from its lines rather than stored separately. */
export const FULFILMENT_STATUSES = [
  'Pending', 'Allocated', 'Picking', 'Picked', 'Packed',
  'ReadyToShip', 'Dispatched', 'InTransit', 'Delivered', 'Cancelled', 'Returned',
];

const qty = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

/**
 * Works out where an order has got to from what its lines say.
 *
 * Derived rather than set by hand at each step: a status somebody has to
 * remember to update is a status that eventually lies. Terminal states are the
 * exception — dispatched and beyond are facts about the outside world that the
 * lines cannot tell us.
 */
export function deriveStatus(order, items) {
  if (['Dispatched', 'InTransit', 'Delivered', 'Cancelled', 'Returned'].includes(order.fulfilmentStatus)) {
    return order.fulfilmentStatus;
  }

  const total = items.reduce((sum, i) => sum + qty(i.quantity), 0);
  if (total === 0) return 'Pending';

  const allocated = items.reduce((sum, i) => sum + qty(i.allocatedQty), 0);
  const picked = items.reduce((sum, i) => sum + qty(i.pickedQty), 0);
  const packed = items.reduce((sum, i) => sum + qty(i.packedQty), 0);

  if (packed >= total - 0.001) return 'ReadyToShip';
  if (packed > 0) return 'Packed';
  if (picked >= total - 0.001) return 'Picked';
  if (picked > 0) return 'Picking';
  if (allocated > 0) return 'Allocated';
  return 'Pending';
}

/** A one-line summary of an order's progress, for lists and pick queues. */
export function progressOf(items = []) {
  const sum = (field) => items.reduce((total, item) => total + qty(item[field]), 0);
  const ordered = sum('quantity');

  return {
    ordered,
    allocated: sum('allocatedQty'),
    picked: sum('pickedQty'),
    packed: sum('packedQty'),
    dispatched: sum('dispatchedQty'),
    outstanding: qty(ordered - sum('dispatchedQty')),
  };
}

/**
 * How much of a line still needs each step. Used by the pick list and the
 * packing screen so neither offers work that is already done.
 */
export function remainingOn(item) {
  const ordered = qty(item.quantity);
  return {
    toAllocate: qty(ordered - qty(item.allocatedQty)),
    toPick: qty(qty(item.allocatedQty) - qty(item.pickedQty)),
    toPack: qty(qty(item.pickedQty) - qty(item.packedQty)),
    toDispatch: qty(qty(item.packedQty) - qty(item.dispatchedQty)),
  };
}
