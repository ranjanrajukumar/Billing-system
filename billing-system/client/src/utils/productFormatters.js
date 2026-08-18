/**
 * Formats packaging information from a product or invoice line item.
 * E.g., packageSize: "500", packageUnit: "Gram", packType: "Packet" -> "500 Gram Packet"
 */
export function formatPackage(itemOrProduct) {
  if (!itemOrProduct) return '';
  const product = itemOrProduct.Product || itemOrProduct;
  
  const size = (product.packageSize || itemOrProduct.packageSize || '').trim();
  const unit = (product.packageUnit || itemOrProduct.packageUnit || '').trim();
  const type = (product.packType || itemOrProduct.packType || '').trim();

  const parts = [];
  if (size) parts.push(size);
  if (unit && !size.toLowerCase().endsWith(unit.toLowerCase())) parts.push(unit);
  if (type && !unit.toLowerCase().includes(type.toLowerCase()) && !size.toLowerCase().includes(type.toLowerCase())) {
    parts.push(type);
  }

  // Fallback to packing attribute if available
  if (!parts.length && itemOrProduct.packing) {
    return String(itemOrProduct.packing).trim();
  }

  return parts.join(' ');
}

/**
 * Returns formatted product display title with package:
 * "Tata Salt - 500 Gram Packet"
 */
export function formatProductTitle(itemOrProduct) {
  if (!itemOrProduct) return '';
  const product = itemOrProduct.Product || itemOrProduct;
  const name = product.productName || itemOrProduct.productName || 'Product';
  const pkg = formatPackage(itemOrProduct);
  return pkg ? `${name} - ${pkg}` : name;
}

/**
 * Returns full product label for dropdowns and search:
 * "Tata Salt - 500 Gram Packet (SKU: TS-500G)"
 */
export function formatProductOption(product) {
  if (!product) return '';
  const title = formatProductTitle(product);
  const sku = product.sku ? ` (SKU: ${product.sku})` : '';
  return `${title}${sku}`;
}
