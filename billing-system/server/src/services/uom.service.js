import { ProductUom, ProductVariant } from '../models/index.js';
import { resolveUnits } from '../utils/units.js';

/**
 * Quantity conversion, in one place.
 *
 * Every module that moves stock — the till, receiving, transfers, returns,
 * counts, adjustments — asks this for one thing: given what the user typed and
 * the unit they picked, how many base units is that? Nothing else is allowed to
 * multiply a quantity by a factor. When conversion is re-derived at call sites
 * they drift, and the drift is invisible: a receipt that posts ten times too
 * much stock looks exactly like a receipt.
 *
 * Two generations of configuration are supported, deliberately:
 *
 *   - `product_uoms` rows, the current model: any number of units per product,
 *     each with its own factor to the base unit.
 *   - the older `primaryUnit` / `secondaryUnit` / `unitConversionFactor` triple
 *     on the product itself.
 *
 * Products configured the old way keep working untouched — there are hundreds
 * of them and no reason to force a migration on a shop that sells everything by
 * the piece. `describe()` reports which path was used, so a surprising number
 * can be traced to its source.
 */

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Rounds to the precision the quantity columns actually store. */
export const toStoredQty = (value) => Math.round(num(value) * 10_000) / 10_000;

/**
 * The unit table for a product: base unit, and the factor for every unit it may
 * be traded in.
 */
export async function unitsFor(product, transaction = null) {
  const rows = await ProductUom.findAll({
    where: { productId: product.id, detstatus: false, isActive: true },
    order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    transaction,
  });

  const legacy = resolveUnits(product);
  const baseRow = rows.find((row) => row.isBase);
  const baseUnit = product.baseUnitCode || baseRow?.unitCode || legacy.primaryUnit;

  const byCode = new Map();
  for (const row of rows) {
    byCode.set(String(row.unitCode).toUpperCase(), {
      unitCode: row.unitCode,
      unitName: row.unitName,
      factorToBase: num(row.factorToBase, 1),
      isBase: Boolean(row.isBase),
      canPurchase: row.canPurchase !== false,
      canSell: row.canSell !== false,
      isQuickPick: Boolean(row.isQuickPick),
      sellingPrice: row.sellingPrice === null ? null : num(row.sellingPrice),
      purchasePrice: row.purchasePrice === null ? null : num(row.purchasePrice),
      source: 'product_uoms',
    });
  }

  // The base unit is always usable even if nobody configured a row for it.
  if (!byCode.has(String(baseUnit).toUpperCase())) {
    byCode.set(String(baseUnit).toUpperCase(), {
      unitCode: baseUnit,
      unitName: baseUnit,
      factorToBase: 1,
      isBase: true,
      canPurchase: true,
      canSell: true,
      isQuickPick: false,
      sellingPrice: null,
      purchasePrice: null,
      source: rows.length ? 'product_uoms' : 'base-default',
    });
  }

  // The legacy secondary unit, where it is not already described by a row.
  if (legacy.secondaryUnit && legacy.factor > 1) {
    const key = String(legacy.secondaryUnit).toUpperCase();
    if (!byCode.has(key)) {
      byCode.set(key, {
        unitCode: legacy.secondaryUnit,
        unitName: legacy.secondaryUnit,
        factorToBase: legacy.factor,
        isBase: false,
        canPurchase: true,
        canSell: true,
        isQuickPick: false,
        sellingPrice: product.secondarySellingPrice === null || product.secondarySellingPrice === undefined
          ? null
          : num(product.secondarySellingPrice),
        purchasePrice: null,
        source: 'product-legacy',
      });
    }
  }

  return { baseUnit, units: byCode, list: [...byCode.values()] };
}

/**
 * Converts a quantity in some unit into the product's base unit.
 *
 * Throws rather than guesses on an unknown unit. Treating an unrecognised unit
 * as the base one is the failure that moves stock by a factor of a thousand on
 * a typo, and it is silent — the alternative is an error somebody reads.
 */
export async function toBaseQty({ product, unitCode, quantity, transaction = null, intent = null }) {
  const table = await unitsFor(product, transaction);
  const requested = unitCode ? String(unitCode).toUpperCase() : String(table.baseUnit).toUpperCase();
  const unit = table.units.get(requested);

  if (!unit) {
    throw Object.assign(
      new Error(
        `"${unitCode}" is not a unit configured for ${product.productName || `product ${product.id}`}. `
        + `Configured units: ${[...table.units.values()].map((u) => u.unitCode).join(', ')}.`,
      ),
      { status: 400 },
    );
  }

  if (intent === 'sell' && unit.canSell === false) {
    throw Object.assign(new Error(`${unit.unitCode} is not a selling unit for this product`), { status: 400 });
  }
  if (intent === 'purchase' && unit.canPurchase === false) {
    throw Object.assign(new Error(`${unit.unitCode} is not a purchase unit for this product`), { status: 400 });
  }

  const baseQty = toStoredQty(num(quantity) * unit.factorToBase);

  return {
    baseQty,
    baseUnit: table.baseUnit,
    enteredQty: num(quantity),
    enteredUnit: unit.unitCode,
    factorToBase: unit.factorToBase,
    source: unit.source,
  };
}

/**
 * Base units back into something a person reads.
 *
 * 8890 grams is correct and unhelpful; "8.89 kg" is what goes on a shelf label.
 * Both are returned because reports need the exact figure and the readable one
 * side by side, and because rounding for display must never leak back into a
 * balance.
 */
export async function fromBaseQty({ product, baseQty, transaction = null }) {
  const table = await unitsFor(product, transaction);
  const quantity = num(baseQty);

  // The largest *selling* unit that the quantity fills at least one of.
  //
  // Selling units only: stock is read in the units it is traded out in, not the
  // ones it arrived in. 48,890g of seed is "48.89 KG" to everybody who handles
  // it — shelf label, stock report, shop floor — and "4.889 BUCKET" to nobody,
  // even though a bucket is the larger unit and the arithmetic is identical.
  //
  // Requiring the quantity to fill at least one keeps a small remainder in a
  // small unit rather than reporting it as "0.02 sacks".
  const candidates = table.list
    .filter((unit) => unit.canSell !== false
      && unit.factorToBase > 1
      && Math.abs(quantity) >= unit.factorToBase)
    .sort((a, b) => b.factorToBase - a.factorToBase);

  const readable = candidates[0]
    ? {
      quantity: Math.round((quantity / candidates[0].factorToBase) * 10_000) / 10_000,
      unitCode: candidates[0].unitCode,
    }
    : { quantity: toStoredQty(quantity), unitCode: table.baseUnit };

  return {
    baseQty: toStoredQty(quantity),
    baseUnit: table.baseUnit,
    readable,
    label: `${readable.quantity} ${readable.unitCode}`,
  };
}

/**
 * Resolves what a till scanned or picked into the identifiers the engine needs.
 *
 * A barcode on a pouch identifies a variant; a product code with a typed weight
 * identifies loose stock. Both arrive at the same engine call — the difference
 * is only which balance is touched.
 */
export async function resolveSaleTarget({
  product, variantId = null, unitCode = null, quantity, transaction = null,
  // Null means "do not restrict". `canSell` and `canPurchase` describe what the
  // till and the receiving screen should *offer*; they are not a rule the
  // engine can enforce on every movement, because a stock adjustment counted in
  // buckets and a return of goods bought by the bucket are both legitimate. The
  // till passes 'sell' explicitly, which is where the guard actually earns its
  // place — keying a sale in a purchase-only unit is a thousandfold error.
  intent = null,
}) {
  if (variantId) {
    const variant = await ProductVariant.findOne({
      where: { id: variantId, productId: product.id, detstatus: false },
      transaction,
    });
    if (!variant) {
      throw Object.assign(new Error('That pack size does not belong to this product'), { status: 400 });
    }
    if (!variant.isActive) {
      throw Object.assign(new Error(`${variant.variantName} is no longer available`), { status: 400 });
    }

    // Packaged stock counts packs, not contents. Two 100g pouches deduct two
    // from the pouch balance, never 200 from the loose bucket.
    return {
      kind: 'Packaged',
      variantId: variant.id,
      variantName: variant.variantName,
      baseQty: toStoredQty(quantity),
      stockUnit: 'pack',
      packSize: variant.packSize === null ? null : num(variant.packSize),
    };
  }

  const converted = await toBaseQty({ product, unitCode, quantity, transaction, intent });
  return {
    kind: 'Bulk',
    variantId: 0,
    variantName: null,
    baseQty: converted.baseQty,
    stockUnit: converted.baseUnit,
    enteredQty: converted.enteredQty,
    enteredUnit: converted.enteredUnit,
    factorToBase: converted.factorToBase,
  };
}

/** What the till should offer for a product: pack sizes, and loose quantities. */
export async function sellOptionsFor(product, transaction = null) {
  const [variants, table] = await Promise.all([
    ProductVariant.findAll({
      where: { productId: product.id, detstatus: false, isActive: true },
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      transaction,
    }),
    unitsFor(product, transaction),
  ]);

  const sellsLoose = ['Bulk', 'Both'].includes(product.stockMode);

  return {
    stockMode: product.stockMode || 'Standard',
    baseUnit: table.baseUnit,
    allowCustomQty: Boolean(product.allowCustomQty),
    packaged: variants.map((variant) => ({
      variantId: variant.id,
      name: variant.variantName,
      sku: variant.sku,
      barcode: variant.barcode,
      packSize: variant.packSize === null ? null : num(variant.packSize),
      packUnitCode: variant.packUnitCode,
      price: variant.sellingPrice === null ? null : num(variant.sellingPrice),
    })),
    bulk: sellsLoose
      ? table.list
        .filter((unit) => unit.canSell)
        .map((unit) => ({
          unitCode: unit.unitCode,
          factorToBase: unit.factorToBase,
          isQuickPick: unit.isQuickPick,
          isBase: unit.isBase,
          price: unit.sellingPrice,
        }))
        .sort((a, b) => a.factorToBase - b.factorToBase)
      : [],
  };
}
