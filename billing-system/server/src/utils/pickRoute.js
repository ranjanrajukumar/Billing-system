/**
 * The walk order: which stop comes next.
 *
 * Deliberately dependency-free and in `utils` rather than beside the picking
 * service. Both the allocator (`binStock.service`) and the route builder
 * (`pickPath.service`) need it, and they already depend on each other in the
 * other direction — putting the comparator in either one makes the pair
 * circular. It is also pure, which means it can be reasoned about and tested
 * without a database.
 */

/**
 * Where a bin with no sequence sorts.
 *
 * Last, not first. An unsequenced bin is one nobody has placed in the route, so
 * sending a picker there first would start every round in an unknown corner of
 * the building. Sorting them to the end means the known route is walked properly
 * and the unplaced stops are mopped up afterwards.
 */
export const UNSEQUENCED = Number.MAX_SAFE_INTEGER;

export const sequenceOf = (stop) => (
  stop?.pickSequence === null || stop?.pickSequence === undefined
    ? UNSEQUENCED
    : Number(stop.pickSequence)
);

/**
 * Orders two stops on the walk, with tie-breaks that make it repeatable.
 *
 * Determinism is not fussiness. The same order picked twice must produce the
 * same route, or a supervisor comparing two printed lists sees differences that
 * mean nothing, and a scanner re-fetching mid-round renumbers the stops under
 * the picker's feet.
 *
 * Three tie-breaks, because there are three genuine ways to tie: two bins can
 * share a sequence (facing each other across an aisle really is one stop), one
 * bin can hold several products, and one product can sit in a bin as two lots.
 */
export function compareStops(a, b) {
  const aSeq = sequenceOf(a);
  const bSeq = sequenceOf(b);
  if (aSeq !== bSeq) return aSeq - bSeq;

  // Numeric-aware, so A-2 sorts before A-10 rather than after it.
  const codes = String(a.binCode || '').localeCompare(
    String(b.binCode || ''), undefined, { numeric: true },
  );
  if (codes !== 0) return codes;

  const products = Number(a.productId || 0) - Number(b.productId || 0);
  if (products !== 0) return products;

  // Last resort: two lots of one product in one bin. Preserves the order the
  // allocator emitted them in, which is oldest-expiry-first.
  return Number(a.binStockId || 0) - Number(b.binStockId || 0);
}

/**
 * Numbers a set of stops into a route.
 *
 * `routeSequence` is what the scanner counts through — stop 1, 2, 3 of this
 * round — and is deliberately separate from `pickSequence`, which is the bin's
 * permanent position in the building. A picker needs "2 of 7"; the bin needs to
 * go on saying 110 whether or not today's order visits it.
 *
 * Copies rather than sorting in place, so a caller holding the original list
 * still has it in allocation order.
 */
export function orderByRoute(stops = []) {
  return [...stops]
    .sort(compareStops)
    .map((stop, index) => ({ ...stop, routeSequence: index + 1 }));
}
