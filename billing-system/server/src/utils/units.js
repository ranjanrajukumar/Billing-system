/**
 * Unit conversion, defined once.
 *
 * A product is *stocked* in its primary unit and may be *traded* in a larger
 * secondary one: seed kept in KG but sold by the BAG, screws kept in PCS but
 * bought by the BOX. The conversion factor says how many primary units make up
 * one secondary unit:
 *
 *     1 secondaryUnit = unitConversionFactor × primaryUnit
 *     e.g. 1 BOX = 10 PCS, so factor = 10
 *
 * That direction is the whole point of this file. It used to be re-derived at
 * every call site, and the call sites disagreed — one screen printed the rule
 * inverted, one document type multiplied for any unfamiliar unit, and invoice
 * edits skipped the conversion entirely, so a corrected bill quietly moved the
 * wrong quantity of stock. Everything now goes through `toPrimaryQty`.
 */

/** The unit facts for a product, with the billed unit resolved. */
export function resolveUnits(product, billedUnit) {
  const primaryUnit = product?.primaryUnit || 'PCS';
  const secondaryUnit = product?.secondaryUnit || null;
  const factor = Number(product?.unitConversionFactor || 1);
  const unit = billedUnit || primaryUnit;

  return {
    billedUnit: unit,
    primaryUnit,
    secondaryUnit,
    factor,
    // Only a genuine secondary unit converts. An unrecognised unit is treated
    // as the primary one rather than silently multiplied — guessing here would
    // move stock by a factor of ten on a typo.
    isSecondary: Boolean(secondaryUnit) && unit === secondaryUnit && factor > 1,
  };
}

/**
 * Converts a billed quantity into the primary unit that stock is held in.
 * Returns the quantity unchanged when no conversion applies.
 */
function toPrimaryQty(product, billedUnit, quantity) {
  const { isSecondary, factor } = resolveUnits(product, billedUnit);
  const qty = Number(quantity || 0);
  return isSecondary ? qty * factor : qty;
}

/**
 * The unit fields to snapshot onto a document line.
 *
 * Copied onto the line rather than looked up later, so reprinting an old
 * document still shows the conversion that was actually applied even if the
 * product's units have since been changed.
 */
export function unitSnapshot(product, billedUnit, quantity) {
  const units = resolveUnits(product, billedUnit);
  return {
    um: units.billedUnit,
    primaryUnit: units.primaryUnit,
    unitConversionFactor: units.factor,
    primaryQty: toPrimaryQty(product, billedUnit, quantity),
  };
}

/**
 * Converts using the snapshot already stored on a document line.
 *
 * A saved line records the unit it was billed in, the primary unit and the
 * factor, but not the product's secondary unit — so the test is simply "was
 * this billed in something other than the stock unit". Using the line rather
 * than re-reading the product means a receipt keyed last week still posts the
 * way it was entered, even if the product's units have since been changed.
 */
export function primaryQtyFromLine(line, quantity) {
  const qty = Number(quantity ?? line?.quantity ?? 0);
  const factor = Number(line?.unitConversionFactor || 1);
  const billed = line?.um || null;
  const primary = line?.primaryUnit || null;

  const converts = billed && primary && billed !== primary && factor > 1;
  return converts ? qty * factor : qty;
}

/** Human-readable conversion rule, phrased in the direction the engine uses. */
function conversionLabel(product) {
  const { primaryUnit, secondaryUnit, factor } = resolveUnits(product);
  if (!secondaryUnit || !(factor > 1)) return null;
  return `1 ${secondaryUnit} = ${factor} ${primaryUnit}`;
}

/**
 * The price to charge, given the customer's tier and the unit being billed.
 *
 * Tiers fall back to the plain selling price when unset, so a shop that has
 * only one price never has to think about any of this.
 */
export function priceFor(product, { tier = 'Retail', billedUnit = null } = {}) {
  const { isSecondary } = resolveUnits(product, billedUnit);

  // A secondary-unit price is quoted per secondary unit, so it wins outright.
  if (isSecondary && Number(product?.secondarySellingPrice) > 0) {
    return Number(product.secondarySellingPrice);
  }

  const byTier = {
    Wholesale: product?.wholesalePrice,
    Dealer: product?.dealerPrice,
  }[tier];

  const base = Number(byTier) > 0 ? Number(byTier) : Number(product?.sellingPrice || 0);
  // Without a per-secondary-unit price, a secondary unit costs factor times the
  // primary price — one box of ten is ten pieces' worth.
  return isSecondary ? base * Number(product?.unitConversionFactor || 1) : base;
}
