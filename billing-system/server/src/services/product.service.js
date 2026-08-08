const optionalInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  return Number.parseInt(value, 10);
};

const numberOrZero = (value) => {
  if (value === '' || value === null || value === undefined) return 0;
  return Number(value);
};

export function normalizeProductPayload(body, userId) {
  return {
    productName: body.productName?.trim(),
    categoryId: optionalInt(body.categoryId),
    hsnCode: body.hsnCode?.trim(),
    purchasePrice: numberOrZero(body.purchasePrice),
    sellingPrice: numberOrZero(body.sellingPrice),
    gstPercent: numberOrZero(body.gstPercent),
    stock: numberOrZero(body.stock),
    barcode: body.barcode?.trim() || null,
    lowStockThreshold: optionalInt(body.lowStockThreshold) ?? 5,
    isActive: body.isActive === undefined ? true : ['true', true, '1', 1].includes(body.isActive),
    authadd: userId
  };
}

export function normalizeProductUpdate(body, userId) {
  const payload = normalizeProductPayload(body, userId);
  delete payload.authadd;
  payload.authlstedit = userId;
  return payload;
}

export function buildInventorySummary(products) {
  return products.reduce((summary, product) => {
    const stock = Number(product.stock || 0);
    const lowStockThreshold = Number(product.lowStockThreshold || 0);
    const sellingPrice = Number(product.sellingPrice || 0);
    const purchasePrice = Number(product.purchasePrice || 0);

    summary.totalProducts += 1;
    summary.totalUnits += stock;
    summary.stockValue += stock * sellingPrice;
    summary.stockCost += stock * purchasePrice;
    if (stock <= 0) summary.outOfStock += 1;
    else if (stock <= lowStockThreshold) summary.lowStock += 1;
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
