export function lineTotal({ quantity, rate, discount, gstPercent }) {
  const taxable = Math.max(Number(quantity || 0) * Number(rate || 0) - Number(discount || 0), 0);
  return taxable + taxable * (Number(gstPercent || 0) / 100);
}

// The client posts line items using the invoice vocabulary (rate/discount/gstPercent).
// Sales orders and quotations store unitPrice/totalPrice, so map before persisting.
export function normalizeOrderItems(items = []) {
  return items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.rate ?? item.unitPrice ?? 0);
    const discount = Number(item.discount || 0);
    const gstPercent = Number(item.gstPercent || 0);
    return {
      productId: item.productId,
      quantity,
      unitPrice,
      discount,
      gstPercent,
      totalPrice: lineTotal({ quantity, rate: unitPrice, discount, gstPercent })
    };
  });
}

export function itemsTotal(items = []) {
  return Math.round(normalizeOrderItems(items).reduce((sum, item) => sum + item.totalPrice, 0));
}
