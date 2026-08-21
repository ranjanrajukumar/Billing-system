import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('Product', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  productName: { type: DataTypes.STRING(180), allowNull: false },
  hsnCode: { type: DataTypes.STRING(20), allowNull: true, defaultValue: '' },
  purchasePrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  sellingPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  gstPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  // Mirror of the total across all locations; `branch_stock` is the authority.
  // Decimal for the same reason branch_stock is — see the note there.
  stock: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 0 },

  // ---- Product master ----
  sku: { type: DataTypes.STRING(60), allowNull: true },
  brandId: { type: unsignedInteger(sequelize), allowNull: true },
  mrp: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  // Tier pricing. Null falls back to sellingPrice, so a shop that only has one
  // price never has to think about any of this.
  wholesalePrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  dealerPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

  // ---- Reordering ----
  minimumStock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  reorderLevel: { type: DataTypes.INTEGER, allowNull: true },
  reorderQuantity: { type: DataTypes.INTEGER, allowNull: true },

  // ---- How this product is stocked and sold ----
  //
  // One product, configured — not four product types with four code paths.
  //   Standard  counted in whole units, the ordinary case
  //   Variant   sold only as packaged sizes, each its own SKU
  //   Bulk      sold loose, measured out of open stock
  //   Both      packaged sizes on the shelf and loose stock in the bucket
  //
  // A shop that never sells anything loose leaves this at Standard and never
  // meets a unit conversion.
  stockMode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Standard' },

  // The unit every balance for this product is held in. Should be the smallest
  // unit it is genuinely traded in — gram rather than kilogram — so a 10g sale
  // is an exact integer rather than 0.01 of something. Null falls back to
  // primaryUnit, which is what every existing product has.
  baseUnitCode: { type: DataTypes.STRING(20), allowNull: true },

  // Whether the till may accept a typed quantity, or only the configured
  // quick-pick sizes. Off by default: free-text quantity at a counter is how
  // 1000g gets keyed as 10000g.
  allowCustomQty: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // Whether loose stock for this product is tracked vessel by vessel.
  trackContainers: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // ---- Planning defaults ----
  // Fallbacks for locations with no `inventory_policies` row of their own, so
  // planning works on day one without anyone configuring fifty stores. A
  // per-location policy always wins where one exists.
  maximumStock: { type: DataTypes.INTEGER, allowNull: true },
  safetyStock: { type: DataTypes.INTEGER, allowNull: true },
  // Days from placing an order on the supplier to the goods being sellable.
  leadTimeDays: { type: DataTypes.INTEGER, allowNull: true },
  // Case or pallet size the supplier ships in, and the smallest order they
  // will accept. Recommendations are rounded up to respect both.
  orderMultiple: { type: DataTypes.INTEGER, allowNull: true },
  minimumOrderQty: { type: DataTypes.INTEGER, allowNull: true },
  // Movement classification, maintained by the inventory intelligence pass
  // rather than typed in: Fast, Normal, Slow, NonMoving.
  movementClass: { type: DataTypes.STRING(20), allowNull: true },

  // ---- Tracking, opt-in per product ----
  batchRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  expiryRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  serialRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  warrantyMonths: { type: DataTypes.INTEGER, allowNull: true },

  // How this product needs to be stored, which is what put-away rules match on.
  // 'Standard' for almost everything; the rest exist because a warehouse
  // genuinely cannot put them just anywhere.
  storageClass: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Standard' },

  // How much space and weight one unit takes. Both optional: most shops never
  // measure a product, and everything falls back to counting units.
  //
  // Volume is what a warehouse actually rents out, so storage charges bill on
  // it where it is known — a pallet of pillows and a pallet of tiles are one
  // unit each and cost very different amounts to store. Weight is the limit a
  // shelf fails on rather than the one it fills on.
  unitVolume: { type: DataTypes.DECIMAL(12, 6), allowNull: true },
  unitWeightKg: { type: DataTypes.DECIMAL(12, 4), allowNull: true },

  // Variants, kept as plain attributes rather than a variant table: most shops
  // want "red, large" on the product, not a second entity to maintain.
  size: { type: DataTypes.STRING(40), allowNull: true },
  color: { type: DataTypes.STRING(40), allowNull: true },
  
  // Packaging Details
  packageSize: { type: DataTypes.STRING(60), allowNull: true }, // e.g. 500
  packageUnit: { type: DataTypes.STRING(20), allowNull: true }, // e.g. Gram
  packType: { type: DataTypes.STRING(20), allowNull: true }, // e.g. Packet

  description: { type: DataTypes.TEXT, allowNull: true },
  customAttributes: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  // Not unique in the database: products are soft deleted, and a unique index
  // would keep a removed product's barcode locked forever. Uniqueness among
  // live products is enforced in the controller instead.
  barcode: { type: DataTypes.STRING(80) },
  lowStockThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
  primaryUnit: { type: DataTypes.STRING(20), defaultValue: 'PCS' },
  secondaryUnit: { type: DataTypes.STRING(20), allowNull: true },
  unitConversionFactor: { type: DataTypes.DECIMAL(10, 4), defaultValue: 1 },
  secondarySellingPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  imagePath: { type: DataTypes.STRING(255) },
  imageData: { type: DataTypes.BLOB('long') },
  imageMimeType: { type: DataTypes.STRING(100) },
  // Where clients should fetch the image; falls back to the legacy disk path.
  imageUrl: {
    type: DataTypes.VIRTUAL,
    get() { return this.imageMimeType ? `/media/products/${this.id}` : (this.imagePath || null); }
  }
,
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'products',
  // Image bytes are only ever needed by the media endpoint, so keep them out of every other query.
  defaultScope: { attributes: { exclude: ['imageData'] } },
  indexes: [
    { fields: ['product_name'] }, { fields: ['barcode'] }, { fields: ['hsn_code'] },
    { fields: ['sku'] }, { fields: ['brand_id'] }
  ]
});
