import { Op } from 'sequelize';
import { Product, WarehouseTask } from '../../models/index.js';
import { suggestPick } from './binStock.service.js';
import * as tasks from './warehouseTask.service.js';
import { UNSEQUENCED, compareStops, orderByRoute } from '../../utils/pickRoute.js';

// Re-exported so callers have one obvious place to reach for the walk order.
export { compareStops, orderByRoute };

/**
 * Turning a set of picks into a walk.
 *
 * The one thing this file must not do is change *what* gets picked. Which lot
 * leaves the building is an inventory decision — oldest expiry first, so stock
 * does not rot on a shelf — and it is made by `suggestPick` before anything here
 * runs. What is decided here is only the order those already-chosen stops are
 * visited in.
 *
 * Keeping the two apart matters because they genuinely disagree. FEFO might
 * send a picker to the far end of the building for an old lot and back again for
 * a newer one; routing wants both trips merged into one pass. If routing were
 * folded into the allocation loop, the cheaper walk would quietly start
 * overriding the expiry rule, and the first anybody would know is a write-off.
 *
 * So: allocate by FEFO, then sort the result by the walk. The quantities are
 * identical either way — only the sequence changes.
 */

/**
 * Builds one walk across every line of an order.
 *
 * Routing per line would be useless: three products in the same aisle would be
 * three separate walks. The stops are flattened across all lines first, then
 * ordered once, so a picker collects everything in one pass.
 *
 * Allocation still happens line by line, exactly as before — each line's FEFO
 * choice is made independently and is unaffected by what any other line needs.
 */
export async function buildRoute({
  branchId, lines = [], ownerId = null, transaction = undefined,
}) {
  const perLine = [];
  const stops = [];

  for (const line of lines) {
    const wanted = Number(line.quantity);
    // A line with nothing outstanding still appears in the result, so a caller
    // rendering a pick list shows every line rather than silently dropping the
    // ones already done.
    const suggestion = wanted > 0
      ? await suggestPick({
        branchId,
        productId: line.productId,
        quantity: wanted,
        ownerId: line.ownerId ?? ownerId,
        transaction,
      })
      : { picks: [], shortfall: 0, complete: true };

    perLine.push({ ...line, ...suggestion });

    for (const pick of suggestion.picks) {
      stops.push({
        ...pick,
        // Carried onto the stop so the scanner never has to hold the line
        // structure in memory to know what it is looking at.
        itemId: line.itemId ?? null,
        productId: line.productId,
        productCode: line.productCode ?? null,
        productName: line.productName ?? null,
        unit: line.unit ?? null,
      });
    }
  }

  const route = orderByRoute(stops);

  return {
    branchId,
    // The per-line view, unchanged in shape, so existing screens keep working.
    lines: perLine,
    // The flat walk. This is what a handheld follows.
    route,
    totalStops: route.length,
    // Surfaced rather than buried: a route with unsequenced stops still works,
    // but the picker will be sent to those bins in an arbitrary order at the end,
    // and somebody should know the layout is incomplete.
    unsequencedStops: route.filter((s) => s.pickSequence === null).length,
    shortfalls: perLine
      .filter((l) => Number(l.shortfall) > 0)
      .map((l) => ({
        itemId: l.itemId ?? null,
        productId: l.productId,
        productName: l.productName ?? null,
        wanted: Number(l.quantity),
        short: Number(l.shortfall),
      })),
  };
}

/**
 * Fills in product names for stops whose caller did not supply them.
 *
 * One query for the whole route rather than one per stop. The per-stop version
 * is the obvious way to write this and is also how a fifty-line order turns
 * into fifty round trips on the busiest screen in the warehouse.
 */
async function decorateProducts(route = [], transaction = undefined) {
  const missing = [...new Set(
    route.filter((s) => !s.productName).map((s) => Number(s.productId)),
  )];
  if (!missing.length) return route;

  const products = await Product.findAll({
    where: { id: { [Op.in]: missing } },
    attributes: ['id', 'productName', 'sku', 'barcode', 'primaryUnit'],
    transaction,
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  return route.map((stop) => {
    if (stop.productName) return stop;
    const product = byId.get(Number(stop.productId));
    return {
      ...stop,
      productName: product?.productName ?? null,
      productCode: stop.productCode ?? product?.sku ?? null,
      barcode: product?.barcode ?? null,
      unit: stop.unit ?? product?.primaryUnit ?? null,
    };
  });
}

/** The shape a scanner walks. One object per stop, in order. */
export function routeDto(route = []) {
  return route.map((stop) => ({
    routeSequence: stop.routeSequence,
    // Kept as its own field: the scanner shows the route number, but the
    // supervisor debugging a bad walk needs the bin's own position.
    pickSequence: stop.pickSequence ?? null,
    sourceBinId: stop.binId,
    binCode: stop.binCode ?? null,
    sourceBin: {
      id: stop.binId,
      code: stop.binCode ?? null,
      name: stop.binName ?? null,
      pickSequence: stop.pickSequence ?? null,
    },
    itemId: stop.itemId ?? null,
    productId: stop.productId,
    productCode: stop.productCode ?? null,
    productName: stop.productName ?? null,
    unit: stop.unit ?? null,
    barcode: stop.barcode ?? null,
    batchId: stop.batchId ?? null,
    batchNumber: stop.batchNumber ?? null,
    expiryDate: stop.expiryDate ?? null,
    available: stop.available ?? null,
    quantity: stop.pick,
    taskId: stop.taskId ?? null,
  }));
}

/**
 * Turns a route into PICK tasks, one per stop, in walking order.
 *
 * Idempotent by reference. A pick list re-opened on a second device must not
 * double the work, so an existing open task for the same document, product and
 * bin is reused rather than duplicated — checked in one query for the whole
 * route, not one per stop.
 *
 * This is a weaker guarantee than the idempotency key on the route itself, and
 * deliberately so: the key protects against the same *request* arriving twice,
 * while this protects against two different requests asking for the same work.
 * Both happen.
 */
export async function createPickTasks({
  branchId, route = [], referenceType, referenceId,
  assignedUserId = null, priority = 'NORMAL', ownerId = null,
  userId = null, transaction = undefined,
}) {
  if (!referenceType || !referenceId) {
    throw Object.assign(
      new Error('Pick tasks must say which document they are for'),
      { status: 400 },
    );
  }

  const existing = await WarehouseTask.findAll({
    where: {
      detstatus: false,
      taskType: 'PICK',
      referenceType,
      referenceId,
      status: { [Op.notIn]: ['CANCELLED', 'FAILED'] },
    },
    transaction,
  });

  const seen = new Map(
    existing.map((t) => [`${t.productId}:${t.sourceBinId}:${t.batchId ?? 0}`, t]),
  );

  const created = [];
  const reused = [];

  for (const stop of route) {
    const key = `${stop.productId}:${stop.binId}:${stop.batchId ?? 0}`;
    const already = seen.get(key);

    if (already) {
      reused.push(already);
      continue;
    }

    const task = await tasks.create({
      taskType: 'PICK',
      branchId,
      sourceBinId: stop.binId,
      productId: stop.productId,
      batchId: stop.batchId ?? null,
      ownerId,
      quantity: stop.pick,
      priority,
      assignedUserId,
      referenceType,
      referenceId,
      instructions: `Take ${stop.pick} from ${stop.binCode || 'the bin'}`
        + (stop.batchNumber ? ` (lot ${stop.batchNumber})` : ''),
      userId,
      transaction,
    });
    created.push(task);
    seen.set(key, task);
  }

  // The tasks carry the bin's pickSequence, copied at creation — so a picker's
  // task list sorts into the same walk without this route having to be stored.
  return {
    created: created.length,
    reused: reused.length,
    tasks: [...created, ...reused].sort((a, b) => {
      const aSeq = a.pickSequence ?? UNSEQUENCED;
      const bSeq = b.pickSequence ?? UNSEQUENCED;
      if (aSeq !== bSeq) return aSeq - bSeq;
      return a.id - b.id;
    }),
  };
}
