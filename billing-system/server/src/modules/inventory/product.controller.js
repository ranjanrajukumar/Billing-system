import { Op } from 'sequelize';
import { Category, Product, ProductBatch, ProductVariant } from '../../models/index.js';
import ExcelJS from 'exceljs';
import { normalizeProductPayload, normalizeProductUpdate } from './product.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { imageColumns } from '../../utils/imageUpload.js';
import { getBranchStock, setBranchStock } from './stock.service.js';
import { Readable } from 'stream';

export const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.baseOnly === 'true') {
    where.parentId = null;
  }
  if (req.query.search) {
    where[Op.or] = [
      { productName: { [Op.like]: `%${req.query.search}%` } },
      { sku: { [Op.like]: `%${req.query.search}%` } },
      { hsnCode: { [Op.like]: `%${req.query.search}%` } },
      { barcode: { [Op.like]: `%${req.query.search}%` } }
    ];
  }
  if (req.query.categoryId) where.categoryId = req.query.categoryId;

  const includeModels = [Category];
  if (req.query.baseOnly === 'true') {
    includeModels.push({
      model: Product,
      as: 'variants',
      where: { detstatus: false },
      required: false
    });
  }

  const { rows, count } = await Product.findAndCountAll({
    where,
    include: includeModels,
    limit,
    offset,
    order: [['addondt', 'DESC']]
  });
  res.json(paged(rows, count, page, limit));
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [
      Category,
      {
        model: Product,
        as: 'variants',
        where: { detstatus: false },
        required: false
      }
    ]
  });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

export const createProduct = asyncHandler(async (req, res) => {
  const basePayload = normalizeProductPayload(req.body, req.user?.id);
  const imageCols = imageColumns(req.file, 'image');

  let variantsData = [];
  if (req.body.variants) {
    try {
      variantsData = typeof req.body.variants === 'string' ? JSON.parse(req.body.variants) : req.body.variants;
    } catch (e) {
      return res.status(400).json({ message: 'Invalid variants JSON format' });
    }
  }

  // Validate SKUs and Barcodes uniqueness in request body (including parent)
  const allSkus = [basePayload.sku?.trim(), ...variantsData.map((v) => v.sku?.trim())].filter(Boolean);
  const allBarcodes = [basePayload.barcode?.trim(), ...variantsData.map((v) => v.barcode?.trim())].filter(Boolean);

  if (new Set(allSkus.map(s => s.toLowerCase())).size !== allSkus.length) {
    return res.status(400).json({ message: 'Duplicate SKUs found in product details' });
  }
  if (new Set(allBarcodes.map(b => b.toLowerCase())).size !== allBarcodes.length) {
    return res.status(400).json({ message: 'Duplicate Barcodes found in product details' });
  }

  // Check database for existing SKUs and Barcodes
  if (allSkus.length) {
    const existingSku = await Product.findOne({ where: { sku: allSkus, detstatus: false } });
    if (existingSku) return res.status(409).json({ message: `SKU ${existingSku.sku} is already used by ${existingSku.productName}` });
  }
  if (allBarcodes.length) {
    const existingBarcode = await Product.findOne({ where: { barcode: allBarcodes, detstatus: false } });
    if (existingBarcode) return res.status(409).json({ message: `Barcode ${existingBarcode.barcode} is already used by ${existingBarcode.productName}` });
  }

  // Validate Rule 9 (Product Name + Size + Unit + Pack Type duplicates)
  const itemsToCheck = variantsData.length > 0 ? variantsData : [{
    packageSize: basePayload.packageSize,
    packageUnit: basePayload.packageUnit,
    packType: basePayload.packType
  }];

  for (const item of itemsToCheck) {
    const duplicate = await Product.findOne({
      where: {
        productName: basePayload.productName,
        packageSize: item.packageSize || null,
        packageUnit: item.packageUnit || null,
        packType: item.packType || null,
        detstatus: false
      }
    });
    if (duplicate) {
      return res.status(409).json({
        message: `A product/variant of "${basePayload.productName}" with size "${item.packageSize || ''}", unit "${item.packageUnit || ''}", and pack type "${item.packType || ''}" already exists (SKU: ${duplicate.sku}).`
      });
    }
  }

  // Create the parent base product
  const parent = await Product.create({
    ...basePayload,
    ...imageCols,
    parentId: null
  });

  // Create variants
  if (variantsData.length > 0) {
    for (const v of variantsData) {
      const variantPayload = normalizeProductPayload(v, req.user?.id);
      const child = await Product.create({
        ...variantPayload,
        productName: parent.productName,
        categoryId: parent.categoryId,
        brandId: parent.brandId,
        parentId: parent.id,
        imagePath: parent.imagePath,
        imageData: parent.imageData,
        imageMimeType: parent.imageMimeType,
      });

      // Initialize stock for the variant
      await setBranchStock({
        productId: child.id,
        branchId: req.branchId,
        quantity: child.stock,
        userId: req.user?.id,
      });
    }
  } else {
    // Single / legacy product creation path
    await setBranchStock({
      productId: parent.id,
      branchId: req.branchId,
      quantity: parent.stock,
      userId: req.user?.id,
    });
  }

  res.status(201).json(await Product.findByPk(parent.id, {
    include: [Category, { model: Product, as: 'variants', where: { detstatus: false }, required: false }]
  }));
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  // Always update from the perspective of the parent product
  const parent = product.parentId ? await Product.findByPk(product.parentId) : product;

  const basePayload = normalizeProductUpdate(req.body, req.user?.id);
  const imageCols = imageColumns(req.file, 'image');

  let variantsData = [];
  if (req.body.variants) {
    try {
      variantsData = typeof req.body.variants === 'string' ? JSON.parse(req.body.variants) : req.body.variants;
    } catch (e) {
      return res.status(400).json({ message: 'Invalid variants JSON format' });
    }
  }

  // Get list of all IDs we are keeping/updating (parent ID and variant IDs)
  const savedIds = [parent.id, ...variantsData.map((v) => v.id).filter(Boolean)];

  // Validate SKUs and Barcodes uniqueness in request body
  const allSkus = [basePayload.sku?.trim(), ...variantsData.map((v) => v.sku?.trim())].filter(Boolean);
  const allBarcodes = [basePayload.barcode?.trim(), ...variantsData.map((v) => v.barcode?.trim())].filter(Boolean);

  if (new Set(allSkus.map(s => s.toLowerCase())).size !== allSkus.length) {
    return res.status(400).json({ message: 'Duplicate SKUs found in request' });
  }
  if (new Set(allBarcodes.map(b => b.toLowerCase())).size !== allBarcodes.length) {
    return res.status(400).json({ message: 'Duplicate Barcodes found in request' });
  }

  // Check database collisions (excluding the IDs we are updating/keeping)
  for (const sku of allSkus) {
    const clash = await Product.findOne({
      where: {
        sku,
        detstatus: false,
        id: { [Op.notIn]: savedIds }
      }
    });
    if (clash) {
      return res.status(409).json({ message: `SKU ${sku} is already used by ${clash.productName}` });
    }
  }

  for (const barcode of allBarcodes) {
    const clash = await Product.findOne({
      where: {
        barcode,
        detstatus: false,
        id: { [Op.notIn]: savedIds }
      }
    });
    if (clash) {
      return res.status(409).json({ message: `Barcode ${barcode} is already used by ${clash.productName}` });
    }
  }

  // Check Rule 9 duplicate variants
  const itemsToCheck = req.body.variants !== undefined
    ? variantsData
    : [{
        id: parent.id,
        packageSize: basePayload.packageSize !== undefined ? basePayload.packageSize : parent.packageSize,
        packageUnit: basePayload.packageUnit !== undefined ? basePayload.packageUnit : parent.packageUnit,
        packType: basePayload.packType !== undefined ? basePayload.packType : parent.packType
      }];

  const parentName = basePayload.productName !== undefined ? basePayload.productName : parent.productName;

  for (const item of itemsToCheck) {
    const duplicate = await Product.findOne({
      where: {
        productName: parentName,
        packageSize: item.packageSize || null,
        packageUnit: item.packageUnit || null,
        packType: item.packType || null,
        detstatus: false,
        id: { [Op.notIn]: item.id ? [item.id] : [] }
      }
    });
    if (duplicate) {
      return res.status(409).json({
        message: `A product/variant of "${parentName}" with size "${item.packageSize || ''}", unit "${item.packageUnit || ''}", and pack type "${item.packType || ''}" already exists (SKU: ${duplicate.sku}).`
      });
    }
  }

  // Update base product
  await parent.update({
    ...basePayload,
    ...imageCols
  });

  if (req.body.variants !== undefined) {
    const currentVariants = await Product.findAll({ where: { parentId: parent.id, detstatus: false } });
    const currentIds = currentVariants.map((v) => v.id);
    const postedIds = variantsData.map((v) => v.id).filter(Boolean);

    // Soft delete removed variants
    const toDelete = currentIds.filter((id) => !postedIds.includes(id));
    if (toDelete.length > 0) {
      await Product.update(
        { detstatus: true, authdel: req.user?.id, delondt: new Date() },
        { where: { id: toDelete } }
      );
    }

    // Update or create variants
    for (const v of variantsData) {
      if (v.id) {
        const variantPayload = normalizeProductUpdate(v, req.user?.id);
        const child = await Product.findByPk(v.id);
        if (child) {
          await child.update({
            ...variantPayload,
            productName: parent.productName,
            categoryId: parent.categoryId,
            brandId: parent.brandId,
            imagePath: parent.imagePath,
            imageData: parent.imageData,
            imageMimeType: parent.imageMimeType,
          });

          // Sync stock
          if (variantPayload.stock !== undefined) {
            await setBranchStock({
              productId: child.id,
              branchId: req.branchId,
              quantity: variantPayload.stock,
              userId: req.user?.id,
            });
          }
        }
      } else {
        const variantPayload = normalizeProductPayload(v, req.user?.id);
        const child = await Product.create({
          ...variantPayload,
          productName: parent.productName,
          categoryId: parent.categoryId,
          brandId: parent.brandId,
          parentId: parent.id,
          imagePath: parent.imagePath,
          imageData: parent.imageData,
          imageMimeType: parent.imageMimeType,
        });

        // Initialize variant stock
        await setBranchStock({
          productId: child.id,
          branchId: req.branchId,
          quantity: child.stock,
          userId: req.user?.id,
        });
      }
    }
  } else {
    // Single / legacy product stock edit
    if (basePayload.stock !== undefined) {
      await setBranchStock({
        productId: parent.id,
        branchId: req.branchId,
        quantity: basePayload.stock,
        userId: req.user?.id,
      });
    }
  }

  // Update base details on all child variants in background
  const activeVariants = await Product.findAll({ where: { parentId: parent.id, detstatus: false } });
  for (const child of activeVariants) {
    await child.update({
      productName: parent.productName,
      categoryId: parent.categoryId,
      brandId: parent.brandId,
      imagePath: parent.imagePath,
      imageData: parent.imageData,
      imageMimeType: parent.imageMimeType,
    });
  }

  res.json(await Product.findByPk(parent.id, {
    include: [Category, { model: Product, as: 'variants', where: { detstatus: false }, required: false }]
  }));
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const itemToDelete = await Product.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!itemToDelete) return res.status(404).json({ message: 'Product not found' });

  await itemToDelete.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  
  // Also soft-delete variants if this is a parent product
  if (!itemToDelete.parentId) {
    await Product.update(
      { detstatus: true, authdel: req.user?.id, delondt: new Date() },
      { where: { parentId: itemToDelete.id, detstatus: false } }
    );
  }

  res.status(204).send();
});

export const listCategories = asyncHandler(async (_req, res) => {
  res.json(await Category.findAll({ order: [['name', 'ASC']] }));
});

/**
 * Resolves a scanned code to a product, with the lots it can be sold from.
 *
 * A barcode scanner types the code and presses Enter, so this has to answer
 * with everything the till needs in one round trip.
 */
export const lookupByBarcode = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ message: 'No barcode given' });

  // The product's own barcode is the loose item. A pack carries its own, and
  // scanning one has to sell that pack — not the same weight of loose stock,
  // which is a different balance and usually a different price.
  let product = await Product.findOne({
    where: { barcode: code, detstatus: false },
    include: Category,
  });
  let variant = null;

  if (!product) {
    variant = await ProductVariant.findOne({
      where: { barcode: code, detstatus: false, isActive: true },
    });
    if (variant) {
      product = await Product.findOne({
        where: { id: variant.productId, detstatus: false },
        include: Category,
      });
    }
  }
  if (!product) return res.status(404).json({ message: `No product has the barcode ${code}` });

  const batches = await ProductBatch.findAll({
    where: {
      productId: product.id,
      branchId: req.branchId,
      detstatus: false,
      quantity: { [Op.gt]: 0 },
    },
    order: [['expiryDate', 'ASC'], ['id', 'ASC']],
  });

  const today = new Date().toISOString().slice(0, 10);
  res.json({
    product,
    // Present only when a pack's barcode was scanned. The till sells this
    // pack; `null` means the loose product, exactly as before.
    variant: variant && {
      variantId: variant.id,
      name: variant.variantName,
      sku: variant.sku,
      barcode: variant.barcode,
      packSize: variant.packSize === null ? null : Number(variant.packSize),
      packUnitCode: variant.packUnitCode,
      price: variant.sellingPrice === null ? null : Number(variant.sellingPrice),
    },
    // Lots belong to the loose pile, so a scanned pack offers none: it was
    // filled from a lot when it was packed, not at the till.
    batches: variant ? [] : batches.filter((b) => !b.expiryDate || b.expiryDate >= today),
    // The balance the scanned thing will actually come off.
    branchStock: await getBranchStock(product.id, req.branchId, null, null, variant ? variant.id : 0),
  });
});

/**
 * Gives a product a barcode, generating one when none is supplied.
 *
 * Generated codes are 13 digits so an ordinary retail scanner reads them, and
 * are checked for collisions rather than trusted to be unique by luck.
 */
export const assignBarcode = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  let code = String(req.body?.barcode || '').trim();
  if (!code) {
    // Prefixed with the id so codes stay related to the catalogue, padded out
    // to a fixed width, and retried in the unlikely event of a clash.
    for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
      const candidate = `2${String(product.id).padStart(5, '0')}${String(Date.now()).slice(-7)}`.slice(0, 13);
      const clash = await Product.findOne({ where: { barcode: candidate, detstatus: false } });
      if (!clash) code = candidate;
    }
    if (!code) return res.status(409).json({ message: 'Could not generate a free barcode, please set one manually' });
  } else {
    // Only live products can block a code; a deleted one frees its barcode.
    const clash = await Product.findOne({
      where: { barcode: code, detstatus: false, id: { [Op.ne]: product.id } },
    });
    if (clash) {
      return res.status(409).json({ message: `Barcode ${code} is already used by ${clash.productName}` });
    }
  }

  await product.update({ barcode: code, authlstedit: req.user?.id });
  res.json({ id: product.id, productName: product.productName, barcode: code });
});

export const importProducts = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  let workbook;
  try {
    workbook = new ExcelJS.Workbook();
    if (req.file.originalname.endsWith('.csv')) {
      await workbook.csv.read(Readable.from(req.file.buffer));
    } else {
      await workbook.xlsx.load(req.file.buffer);
    }
  } catch (err) {
    return res.status(400).json({ message: 'Failed to parse file. Please upload a valid Excel or CSV file.' });
  }
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return res.status(400).json({ message: 'Excel file is empty' });

  const headers = {};
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    if (cell.value) {
      headers[cell.value.toString().trim().toLowerCase()] = colNumber;
    }
  });

  const expectedHeaders = ['productname', 'sku', 'barcode', 'purchaseprice', 'sellingprice', 'gstpercent', 'stock', 'hsncode', 'primaryunit', 'category'];
  
  const colMap = {};
  for (const h of expectedHeaders) {
    if (headers[h]) colMap[h] = headers[h];
  }

  if (!colMap.productname) {
    return res.status(400).json({ message: 'Missing required column: productName' });
  }

  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  const categories = await Category.findAll();
  const categoryMap = {};
  categories.forEach(c => { categoryMap[c.name.toLowerCase()] = c.id; });

  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    if (!row.values || row.values.length === 0) continue;

    const getVal = (colName) => {
      if (!colMap[colName]) return null;
      const cell = row.getCell(colMap[colName]);
      return cell.value !== null && cell.value !== undefined ? cell.value.toString().trim() : null;
    };

    const productName = getVal('productname');
    if (!productName) continue; // Skip empty rows

    const sku = getVal('sku');
    const barcode = getVal('barcode');
    const purchasePrice = parseFloat(getVal('purchaseprice')) || 0;
    const sellingPrice = parseFloat(getVal('sellingprice')) || 0;
    const gstPercent = parseFloat(getVal('gstpercent')) || 0;
    const stock = parseInt(getVal('stock'), 10) || 0;
    const hsnCode = getVal('hsncode') || '';
    const primaryUnit = getVal('primaryunit') || 'PCS';
    const categoryName = getVal('category');

    let categoryId = null;
    if (categoryName) {
      const catKey = categoryName.toLowerCase();
      if (categoryMap[catKey]) {
        categoryId = categoryMap[catKey];
      } else {
        const newCat = await Category.create({ name: categoryName, description: 'Imported from Excel', authlstedit: req.user?.id });
        categoryMap[catKey] = newCat.id;
        categoryId = newCat.id;
      }
    }

    try {
      let product = null;
      if (sku) product = await Product.findOne({ where: { sku, detstatus: false } });
      if (!product && barcode) product = await Product.findOne({ where: { barcode, detstatus: false } });

      const payload = {
        productName, sku, barcode, purchasePrice, sellingPrice, gstPercent,
        hsnCode, primaryUnit, categoryId,
        authlstedit: req.user?.id
      };

      if (product) {
        await product.update(payload);
      } else {
        payload.authadd = req.user?.id;
        payload.stock = stock;
        const newProd = await Product.create(payload);
        if (stock > 0) {
          await setBranchStock({
            productId: newProd.id,
            branchId: req.branchId,
            quantity: stock,
            userId: req.user?.id,
          });
        }
      }
      successCount++;
    } catch (err) {
      errorCount++;
      errors.push(`Row ${i}: ${err.message}`);
    }
  }

  res.json({ successCount, errorCount, errors });
});
