import { Op } from 'sequelize';
import {
  Product, ProductContainer, ProductUom, ProductVariant,
} from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import {
  applyMovement, inventorySnapshot, repackage, transferBetweenLocations,
} from './inventoryEngine.service.js';
import { sellOptionsFor, unitsFor } from './uom.service.js';
import {
  containersFor, openContainer, receiveContainer, reconcileContainers,
} from './container.service.js';

const loadProduct = async (id) => {
  const product = await Product.findByPk(id);
  if (!product || product.detstatus) {
    throw Object.assign(new Error('Product not found'), { status: 404 });
  }
  return product;
};

// ---------------------------------------------------------------------------
// Units of measure, per product
// ---------------------------------------------------------------------------

export const listUnits = asyncHandler(async (req, res) => {
  const product = await loadProduct(req.params.id);
  const table = await unitsFor(product);
  res.json({
    productId: product.id,
    baseUnit: table.baseUnit,
    stockMode: product.stockMode,
    units: table.list,
  });
});

/**
 * Adds or updates one unit for a product.
 *
 * The base unit is the anchor every other factor is expressed against, so it is
 * guarded: a base unit whose factor is not 1 would silently rescale every
 * balance the product has, and a second base unit would make "how much is
 * there" ambiguous.
 */
export const saveUnit = asyncHandler(async (req, res) => {
  const product = await loadProduct(req.params.id);
  const { unitCode, factorToBase, isBase } = req.body || {};

  if (!unitCode) return res.status(400).json({ message: 'unitCode is required' });

  const factor = Number(factorToBase);
  if (!Number.isFinite(factor) || factor <= 0) {
    return res.status(400).json({ message: 'factorToBase must be greater than zero' });
  }
  if (isBase && factor !== 1) {
    return res.status(400).json({
      message: 'The base unit must have a factor of 1 — every other unit is measured against it',
    });
  }

  if (isBase) {
    const existingBase = await ProductUom.findOne({
      where: {
        productId: product.id, isBase: true, detstatus: false,
        unitCode: { [Op.ne]: unitCode },
      },
    });
    if (existingBase) {
      return res.status(409).json({
        message: `${existingBase.unitCode} is already the base unit. Changing it would rescale every existing balance.`,
      });
    }
  }

  const fields = [
    'unitName', 'factorToBase', 'isBase', 'canPurchase', 'canSell',
    'isDefaultPurchase', 'isDefaultSell', 'isQuickPick', 'displayOrder',
    'sellingPrice', 'purchasePrice', 'isActive',
  ];
  const values = {};
  for (const field of fields) {
    if (req.body[field] !== undefined) values[field] = req.body[field] === '' ? null : req.body[field];
  }

  const [row, created] = await ProductUom.findOrCreate({
    where: { productId: product.id, unitCode },
    defaults: { ...values, productId: product.id, unitCode, authadd: req.user?.id ?? null },
  });
  if (!created) await row.update({ ...values, detstatus: false, authlstedit: req.user?.id ?? null });

  res.status(created ? 201 : 200).json(row);
});

export const removeUnit = asyncHandler(async (req, res) => {
  const row = await ProductUom.findOne({
    where: { id: req.params.unitId, productId: req.params.id, detstatus: false },
  });
  if (!row) return res.status(404).json({ message: 'Unit not found for this product' });
  if (row.isBase) {
    return res.status(409).json({ message: 'The base unit cannot be removed — every balance is held in it' });
  }

  await row.update({ detstatus: true, delondt: new Date(), authdel: req.user?.id ?? null });
  res.json({ message: `${row.unitCode} removed` });
});

// ---------------------------------------------------------------------------
// Packaged sizes
// ---------------------------------------------------------------------------

export const listVariants = asyncHandler(async (req, res) => {
  const variants = await ProductVariant.findAll({
    where: { productId: req.params.id, detstatus: false },
    order: [['displayOrder', 'ASC'], ['id', 'ASC']],
  });
  res.json(variants);
});

export const saveVariant = asyncHandler(async (req, res) => {
  const product = await loadProduct(req.params.id);
  const { variantName, sku, barcode } = req.body || {};

  if (!variantName) return res.status(400).json({ message: 'variantName is required' });

  // Uniqueness among live rows only: a discontinued size keeps its code, and
  // re-issuing a barcode years later is ordinary retail.
  for (const [field, value] of [['sku', sku], ['barcode', barcode]]) {
    if (!value) continue;
    const clash = await ProductVariant.findOne({
      where: {
        [field]: value, detstatus: false,
        ...(req.params.variantId ? { id: { [Op.ne]: req.params.variantId } } : {}),
      },
    });
    if (clash) {
      return res.status(409).json({ message: `${field} "${value}" is already used by ${clash.variantName}` });
    }
  }

  const fields = [
    'variantName', 'sku', 'barcode', 'packSize', 'packUnitCode', 'attributes',
    'sellingPrice', 'purchasePrice', 'mrp', 'reorderLevel', 'minimumStock',
    'isActive', 'displayOrder',
  ];
  const values = { productId: product.id };
  for (const field of fields) {
    if (req.body[field] !== undefined) values[field] = req.body[field] === '' ? null : req.body[field];
  }

  if (req.params.variantId) {
    const variant = await ProductVariant.findOne({
      where: { id: req.params.variantId, productId: product.id, detstatus: false },
    });
    if (!variant) return res.status(404).json({ message: 'Pack size not found' });
    await variant.update({ ...values, authlstedit: req.user?.id ?? null });
    return res.json(variant);
  }

  const variant = await ProductVariant.create({ ...values, authadd: req.user?.id ?? null });
  res.status(201).json(variant);
});

export const removeVariant = asyncHandler(async (req, res) => {
  const variant = await ProductVariant.findOne({
    where: { id: req.params.variantId, productId: req.params.id, detstatus: false },
  });
  if (!variant) return res.status(404).json({ message: 'Pack size not found' });

  await variant.update({ detstatus: true, delondt: new Date(), authdel: req.user?.id ?? null });
  res.json({ message: `${variant.variantName} removed` });
});

// ---------------------------------------------------------------------------
// What the till should offer, and what is actually held
// ---------------------------------------------------------------------------

/** Pack sizes and loose quantities, in the shape the POS screen renders. */
export const sellOptions = asyncHandler(async (req, res) => {
  const product = await loadProduct(req.params.id);
  res.json(await sellOptionsFor(product));
});

/** The Product 360 stock picture: loose and every pack size, side by side. */
export const productInventory = asyncHandler(async (req, res) => {
  const branchId = req.query.branchId || req.branchScope;
  if (!branchId) return res.status(400).json({ message: 'branchId is required' });

  res.json(await inventorySnapshot({ productId: req.params.id, branchId }));
});

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * The one endpoint every module posts a stock change to.
 *
 * Exposed deliberately rather than left internal: a till, a scanner app or an
 * integration should be able to say "one kilogram out of Mumbai 01" without
 * knowing how many grams that is or which table holds the balance.
 */
export const postMovement = asyncHandler(async (req, res) => {
  const {
    productId, branchId, quantity, unitCode, variantId, direction = 'out',
    movementType = 'Sale', batchId, notes, referenceType, referenceNumber, containerId,
  } = req.body || {};

  if (!productId || !branchId || quantity === undefined) {
    return res.status(400).json({ message: 'productId, branchId and quantity are required' });
  }
  if (!['in', 'out'].includes(direction)) {
    return res.status(400).json({ message: 'direction must be "in" or "out"' });
  }

  const result = await applyMovement({
    productId, branchId, quantity, unitCode, variantId, direction, movementType,
    batchId, notes, referenceType, referenceNumber, containerId,
    userId: req.user?.id ?? null,
  });

  res.status(201).json(result);
});

export const postTransfer = asyncHandler(async (req, res) => {
  const { productId, fromBranchId, toBranchId, quantity, unitCode, variantId, notes } = req.body || {};
  if (!productId || !fromBranchId || !toBranchId || quantity === undefined) {
    return res.status(400).json({
      message: 'productId, fromBranchId, toBranchId and quantity are required',
    });
  }

  const result = await transferBetweenLocations({
    productId, fromBranchId, toBranchId, quantity, unitCode, variantId, notes,
    userId: req.user?.id ?? null,
  });
  res.status(201).json(result);
});

export const postRepackage = asyncHandler(async (req, res) => {
  const { productId, branchId, variantId, packCount, toPacks = true, notes } = req.body || {};
  if (!productId || !branchId || !variantId || packCount === undefined) {
    return res.status(400).json({
      message: 'productId, branchId, variantId and packCount are required',
    });
  }

  const result = await repackage({
    productId, branchId, variantId, packCount, toPacks, notes,
    userId: req.user?.id ?? null,
  });
  res.status(201).json(result);
});

// ---------------------------------------------------------------------------
// Physical containers
// ---------------------------------------------------------------------------

export const listContainers = asyncHandler(async (req, res) => {
  const { productId, status } = req.query;
  if (!productId) return res.status(400).json({ message: 'productId is required' });

  const branchId = req.query.branchId || req.branchScope || null;
  res.json(await containersFor({ productId, branchId, status }));
});

export const postContainer = asyncHandler(async (req, res) => {
  const {
    productId, branchId, containerCode, containerType, capacityQty,
    batchId, supplierId, expiryDate, notes,
  } = req.body || {};

  if (!productId || !branchId || !containerCode || capacityQty === undefined) {
    return res.status(400).json({
      message: 'productId, branchId, containerCode and capacityQty are required',
    });
  }

  const container = await receiveContainer({
    productId, branchId, containerCode, containerType, capacityQty,
    batchId, supplierId, expiryDate, notes, userId: req.user?.id ?? null,
  });
  res.status(201).json(container);
});

export const openOneContainer = asyncHandler(async (req, res) => {
  const container = await openContainer({
    containerId: req.params.containerId,
    userId: req.user?.id ?? null,
  });
  res.json(container);
});

/** Does the vessel detail still add up to the location balance? */
export const checkContainers = asyncHandler(async (req, res) => {
  const { productId } = req.query;
  const branchId = req.query.branchId || req.branchScope;
  if (!productId || !branchId) {
    return res.status(400).json({ message: 'productId and branchId are required' });
  }

  res.json(await reconcileContainers({ productId, branchId }));
});

/** Containers that are open and running low, across the locations in view. */
export const openContainerAlerts = asyncHandler(async (req, res) => {
  const threshold = Number(req.query.percent || 10) / 100;

  const containers = await ProductContainer.findAll({
    where: scopedWhere(req, { detstatus: false, status: 'Open' }),
    include: [{ model: Product, attributes: ['id', 'productName', 'baseUnitCode'] }],
    limit: 200,
  });

  const low = containers.filter(
    (container) => Number(container.capacityQty) > 0
      && Number(container.remainingQty) / Number(container.capacityQty) <= threshold,
  );

  res.json({
    open: containers.length,
    runningLow: low.length,
    containers: low.map((container) => ({
      id: container.id,
      containerCode: container.containerCode,
      product: container.Product?.productName,
      remainingQty: Number(container.remainingQty),
      capacityQty: Number(container.capacityQty),
      percentLeft: Math.round((Number(container.remainingQty) / Number(container.capacityQty)) * 100),
    })),
  });
});
