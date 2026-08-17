const optionalInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  return Number.parseInt(value, 10);
};

const numberOrZero = (value) => {
  if (value === '' || value === null || value === undefined) return 0;
  return Number(value);
};

/** Money that is genuinely optional — null means "not set", not "free". */
const optionalMoney = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const optionalText = (value) => {
  const text = typeof value === 'string' ? value.trim() : value;
  return text === '' || text === undefined ? null : text ?? null;
};

// Multipart form fields arrive as strings, so "false" would otherwise be truthy.
const asBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', true, '1', 1, 'on', 'yes'].includes(
    typeof value === 'string' ? value.toLowerCase() : value,
  );
};

/**
 * Turns a product form into columns.
 *
 * Deliberately a whitelist: the form posts back every field it read, including
 * audit columns and the mirrored stock total, none of which a request may set.
 * Anything new on the product master has to be added here as well as to the
 * model — a column the model has but this does not is unreachable, which is
 * exactly how MRP and the reorder levels sat unused after they were added.
 */
export function normalizeProductPayload(body, userId) {
  return {
    productName: body.productName?.trim(),
    sku: optionalText(body.sku),
    categoryId: optionalInt(body.categoryId),
    brandId: optionalInt(body.brandId),
    hsnCode: body.hsnCode?.trim() || '',

    // ---- Pricing ----
    purchasePrice: numberOrZero(body.purchasePrice),
    sellingPrice: numberOrZero(body.sellingPrice),
    // Null rather than zero: an unset MRP means "no printed price", and a zero
    // would make every bill claim the item is worth nothing.
    mrp: optionalMoney(body.mrp),
    wholesalePrice: optionalMoney(body.wholesalePrice),
    dealerPrice: optionalMoney(body.dealerPrice),
    secondarySellingPrice: optionalMoney(body.secondarySellingPrice),
    gstPercent: numberOrZero(body.gstPercent),

    // ---- Stock ----
    stock: numberOrZero(body.stock),
    lowStockThreshold: optionalInt(body.lowStockThreshold) ?? 5,
    minimumStock: optionalInt(body.minimumStock) ?? 0,
    reorderLevel: optionalInt(body.reorderLevel),
    reorderQuantity: optionalInt(body.reorderQuantity),

    // ---- Units ----
    primaryUnit: body.primaryUnit?.trim() || 'PCS',
    secondaryUnit: optionalText(body.secondaryUnit),
    unitConversionFactor: numberOrZero(body.unitConversionFactor) || 1,

    // ---- Tracking, opt-in per product ----
    batchRequired: asBoolean(body.batchRequired),
    expiryRequired: asBoolean(body.expiryRequired),
    serialRequired: asBoolean(body.serialRequired),
    warrantyMonths: optionalInt(body.warrantyMonths),

    // How this product must be stored, which is what put-away rules match on.
    storageClass: optionalText(body.storageClass) || 'Standard',
    // Space and weight per unit. Storage charges bill on volume where it is
    // known, so a column missing from this whitelist would be silently
    // unreachable and every client would be billed by unit count instead.
    unitVolume: optionalMoney(body.unitVolume),
    unitWeightKg: optionalMoney(body.unitWeightKg),

    // ---- Descriptive ----
    packageSize: optionalText(body.packageSize),
    productType: optionalText(body.productType) || 'Goods',
    location: optionalText(body.location),
    moq: optionalInt(body.moq),
    taxCategory: optionalText(body.taxCategory),
    size: optionalText(body.size),
    color: optionalText(body.color),
    description: optionalText(body.description),
    barcode: body.barcode?.trim() || null,

    isActive: asBoolean(body.isActive, true),
    authadd: userId,
  };
}

/**
 * An update only writes what the form actually sent.
 *
 * The create path fills every column with a default, which is right for a new
 * product and wrong for an edit: a screen that posts a subset — the quick stock
 * edit, an import, a future partial form — would otherwise blank every field it
 * did not know about.
 */
export function normalizeProductUpdate(body, userId) {
  const full = normalizeProductPayload(body, userId);
  delete full.authadd;

  const payload = { authlstedit: userId };
  for (const [column, value] of Object.entries(full)) {
    if (column === 'authlstedit') continue;
    // `productName` maps from a key of the same name; the rest line up too, so
    // presence in the request body is the test for "the form sent this".
    if (body[column] !== undefined) payload[column] = value;
  }
  return payload;
}

export function buildInventorySummary(products) {
  return products.reduce((summary, product) => {
    const stock = Number(product.stock || 0);
    // Reorder level is the buying trigger; the low-stock threshold is the
    // warning light. A product that sets neither still warns at the default.
    const threshold = Number(product.reorderLevel ?? product.lowStockThreshold ?? 0);
    const sellingPrice = Number(product.sellingPrice || 0);
    const purchasePrice = Number(product.purchasePrice || 0);

    summary.totalProducts += 1;
    summary.totalUnits += stock;
    summary.stockValue += stock * sellingPrice;
    summary.stockCost += stock * purchasePrice;
    if (stock <= 0) summary.outOfStock += 1;
    else if (stock <= threshold) summary.lowStock += 1;
    return summary;
  }, {
    totalProducts: 0,
    totalUnits: 0,
    stockValue: 0,
    stockCost: 0,
    lowStock: 0,
    outOfStock: 0
  });
}
