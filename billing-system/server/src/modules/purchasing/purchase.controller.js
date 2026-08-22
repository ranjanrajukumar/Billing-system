import { Op } from 'sequelize';
import { sequelize, JournalEntry, Product, ProductBatch, Purchase, PurchaseItem, Supplier } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { withDateRange } from '../../utils/dateRange.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { assertAvailable, postStockTransaction } from '../inventory/stock.service.js';
import { postPurchase, reverseEntry } from '../accounting/accounting.service.js';
import { unitSnapshot } from '../../utils/units.js';

async function nextPurchaseNumber(transaction) {
  const year = new Date().getFullYear();
  const count = await Purchase.count({ where: { purchaseNumber: { [Op.like]: `PO-${year}-%` } }, transaction });
  return `PO-${year}-${String(count + 1).padStart(5, '0')}`;
}

function calculateItems(items, byId) {
  const calculated = items.map((item) => {
    const product = byId.get(Number(item.productId));
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const gstPercent = Number(item.gstPercent || 0);
    const taxable = quantity * rate;
    const gstAmount = taxable * gstPercent / 100;

    // A pack is received in packs. There is no conversion to apply — a case of
    // twelve pouches is twelve pouches, whatever is inside them — and running
    // one would receive the contents into the loose pile instead.
    const pack = Number(item.variantId) || 0;
    const measured = pack
      ? { primaryUnit: item.um || null, unitConversionFactor: 1, primaryQty: quantity }
      : unitSnapshot(product, item.um, quantity);

    return {
      ...item,
      variantId: pack,
      // One shared conversion, so a purchase and a sale of the same product in
      // the same unit always move the same quantity of stock.
      ...measured,
      quantity,
      rate,
      gstPercent,
      gstAmount,
      amount: taxable + gstAmount,
    };
  });
  const subtotal = calculated.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const taxAmount = calculated.reduce((sum, item) => sum + item.gstAmount, 0);
  return { items: calculated, subtotal, taxAmount, grandTotal: subtotal + taxAmount };
}

export const listPurchases = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = withDateRange(scopedWhere(req, { detstatus: false }), req.query, 'purchaseDate');
  const { rows, count } = await Purchase.findAndCountAll({
    where,
    include: [Supplier, { model: PurchaseItem, include: Product }],
    limit,
    offset,
    order: [['purchaseDate', 'DESC'], ['id', 'DESC']]
  });
  res.json(paged(rows, count, page, limit));
});

export const getPurchase = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findOne({ where: { id: req.params.id, detstatus: false }, include: [Supplier, { model: PurchaseItem, include: Product }] });
  if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
  res.json(purchase);
});

export const createPurchase = asyncHandler(async (req, res) => {
  const created = await sequelize.transaction(async (transaction) => {
    const supplier = await Supplier.findOne({ where: { id: req.body.supplierId, detstatus: false }, transaction });
    if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });

    const productIds = req.body.items.map((item) => item.productId);
    const products = await Product.findAll({ where: { id: productIds }, transaction, lock: transaction.LOCK.UPDATE });
    const byId = new Map(products.map((p) => [p.id, p]));
    req.body.items.forEach((item) => {
      if (!byId.has(Number(item.productId))) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });
    });

    const totals = calculateItems(req.body.items, byId);
    const purchase = await Purchase.create({
      purchaseNumber: req.body.purchaseNumber || await nextPurchaseNumber(transaction),
      purchaseDate: req.body.purchaseDate,
      branchId: req.branchId,
      supplierId: supplier.id,
      createdBy: req.user.id,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      grandTotal: totals.grandTotal,
      paidAmount: req.body.paidAmount || 0,
      paymentStatus: Number(req.body.paidAmount || 0) >= totals.grandTotal ? 'Paid' : Number(req.body.paidAmount || 0) > 0 ? 'Partially Paid' : 'Unpaid',
      status: req.body.status || 'Received',
      notes: req.body.notes
    }, { transaction });

    await PurchaseItem.bulkCreate(totals.items.map((item) => ({
      purchaseId: purchase.id,
      productId: item.productId,
      variantId: item.variantId || 0,
      um: item.um,
      primaryUnit: item.primaryUnit,
      unitConversionFactor: item.unitConversionFactor,
      primaryQty: item.primaryQty,
      batchNumber: item.batchNumber || null,
      germinationPercent: item.germinationPercent || null,
      expiryDate: item.expiryDate || null,
      quantity: item.quantity,
      rate: item.rate,
      gstPercent: item.gstPercent,
      gstAmount: item.gstAmount,
      amount: item.amount
    })), { transaction });

    if (purchase.status === 'Received') {
      for (const item of totals.items) {
        // Receive into location stock using primaryQty (e.g. 10 BAGS * 50 = 500 KG),
        // writing the ledger row in the same call.
        await postStockTransaction({
          productId: item.productId,
          variantId: item.variantId || 0,
          branchId: req.branchId,
          quantity: Number(item.primaryQty),
          movementType: 'Purchase',
          referenceType: 'Purchase',
          referenceId: purchase.id,
          referenceNumber: purchase.purchaseNumber,
          unitCost: item.rate,
          transactionDate: purchase.purchaseDate,
          notes: `${purchase.purchaseNumber} (${item.quantity} ${item.um} = ${item.primaryQty} ${item.primaryUnit})`,
          transaction,
          userId: req.user.id,
        });

        // If batch number is provided, automatically create or update ProductBatch
        if (item.batchNumber && item.batchNumber.trim()) {
          const batchNo = item.batchNumber.trim();
          const [batchRow] = await ProductBatch.findOrCreate({
            where: { productId: item.productId, branchId: req.branchId, batchNumber: batchNo, detstatus: false },
            defaults: {
              productId: item.productId,
              branchId: req.branchId,
              batchNumber: batchNo,
              lotNumber: batchNo,
              germinationPercent: item.germinationPercent || null,
              expiryDate: item.expiryDate || null,
              quantity: 0,
              purchaseRate: item.rate,
              supplierName: supplier.supplierName,
            },
            transaction,
            lock: transaction.LOCK.UPDATE
          });

          await batchRow.update({
            quantity: Number(batchRow.quantity || 0) + Number(item.primaryQty),
            germinationPercent: item.germinationPercent || batchRow.germinationPercent,
            expiryDate: item.expiryDate || batchRow.expiryDate,
            purchaseRate: item.rate,
            supplierName: supplier.supplierName,
            authlstedit: req.user.id
          }, { transaction });
        }
      }
    }

    // Stock in, ITC claimable, supplier owed. Skipped unless accounting is on.
    await postPurchase({ purchase, transaction, userId: req.user.id });

    return purchase;
  });

  const purchase = await Purchase.findOne({ where: { id: created.id}, include: [Supplier, { model: PurchaseItem, include: Product }] });
  res.status(201).json(purchase);
});

export const removePurchase = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    const purchase = await Purchase.findOne({
      where: { id: req.params.id, detstatus: false },
      include: [PurchaseItem],
      transaction
    });
    if (!purchase) throw Object.assign(new Error('Purchase not found'), { status: 404 });

    if (purchase.status === 'Received') {
      const branchId = purchase.branchId || req.branchId;
      const itemsToValidate = purchase.PurchaseItems.map((it) => ({
        ...it.dataValues,
        quantity: it.primaryQty || it.quantity
      }));
      await assertAvailable(itemsToValidate, branchId, transaction);

      for (const item of purchase.PurchaseItems) {
        const qtyToDeduct = Number(item.primaryQty || item.quantity);
        await postStockTransaction({
          productId: item.productId,
          variantId: item.variantId || 0,
          branchId,
          quantity: -qtyToDeduct,
          movementType: 'Adjustment Out',
          referenceType: 'Purchase Cancellation',
          referenceId: purchase.id,
          referenceNumber: purchase.purchaseNumber,
          unitCost: item.rate,
          notes: `Reversed via cancelled purchase ${purchase.purchaseNumber}`,
          transaction,
          userId: req.user.id,
        });

        if (item.batchNumber) {
          const batchRow = await ProductBatch.findOne({
            where: { productId: item.productId, branchId, batchNumber: item.batchNumber, detstatus: false },
            transaction
          });
          if (batchRow) {
            const nextQty = Math.max(0, Number(batchRow.quantity) - qtyToDeduct);
            await batchRow.update({ quantity: nextQty, authlstedit: req.user.id }, { transaction });
          }
        }
      }
    }

    // Reverse rather than delete the accounting entry.
    const entry = await JournalEntry.findOne({
      where: { sourceType: 'Purchase', sourceId: purchase.id, status: 'Posted', detstatus: false },
      transaction,
    });
    if (entry) {
      await reverseEntry({
        entryId: entry.id,
        userId: req.user.id,
        transaction,
        narration: `Cancellation of purchase ${purchase.purchaseNumber}`,
      });
    }

    await purchase.update({
      detstatus: true,
      status: 'Cancelled',
      authdel: req.user.id,
      delondt: new Date()
    }, { transaction });
  });

  res.json({ message: 'Purchase cancelled and stock reversed' });
});

export const uploadAttachment = asyncHandler(async (req, res) => {
  if (!req.file) throw Object.assign(new Error('No file provided'), { status: 400 });

  const purchase = await Purchase.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!purchase) throw Object.assign(new Error('Purchase not found'), { status: 404 });

  await purchase.update({
    attachmentData: req.file.buffer,
    attachmentMimeType: req.file.mimetype,
    authlstedit: req.user.id
  });

  res.json({ message: 'Attachment uploaded successfully' });
});

export const getPurchaseAttachment = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findOne({
    where: { id: req.params.id, detstatus: false },
    attributes: ['attachmentData', 'attachmentMimeType', 'purchaseNumber']
  });

  if (!purchase || !purchase.attachmentData) {
    return res.status(404).json({ message: 'Attachment not found' });
  }

  res.set('Content-Type', purchase.attachmentMimeType);
  res.set('Content-Disposition', `inline; filename="Bill_${purchase.purchaseNumber}"`);
  res.send(purchase.attachmentData);
});

import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

/**
 * Reads an uploaded .xlsx into the same shape csv-parse produces: one object
 * per row, keyed by the header text.
 *
 * Suppliers send price lists as Excel far more often than as CSV, and asking
 * somebody to re-save as CSV first is a step that gets skipped and then blamed
 * on the software.
 */
async function rowsFromWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw Object.assign(new Error('The spreadsheet has no sheets'), { status: 400 });

  const headers = [];
  worksheet.getRow(1).eachCell((cell, column) => {
    headers[column] = cell.value === null || cell.value === undefined ? '' : cell.value.toString().trim();
  });

  if (!headers.some(Boolean)) {
    throw Object.assign(new Error('The first row must be column headings'), { status: 400 });
  }

  const rows = [];
  for (let index = 2; index <= worksheet.rowCount; index += 1) {
    const row = worksheet.getRow(index);
    const record = {};
    let hasValue = false;

    row.eachCell((cell, column) => {
      const heading = headers[column];
      if (!heading) return;
      // A formula cell carries both the formula and its computed result; the
      // result is what the importer is being told.
      const raw = cell.value && typeof cell.value === 'object' && 'result' in cell.value
        ? cell.value.result
        : cell.value;
      if (raw === null || raw === undefined) return;
      record[heading] = raw.toString().trim();
      if (record[heading] !== '') hasValue = true;
    });

    if (hasValue) rows.push(record);
  }

  return rows;
}

export const importPurchases = asyncHandler(async (req, res) => {
  if (!req.file) throw Object.assign(new Error('No file provided'), { status: 400 });

  const isCsv = /\.csv$/i.test(req.file.originalname || '');
  let records;
  try {
    records = isCsv
      ? parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true })
      : await rowsFromWorkbook(req.file.buffer);
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(
      new Error('Could not read that file. Upload a spreadsheet saved as .xlsx or .csv.'),
      { status: 400 },
    );
  }

  const grouped = {};
  for (const row of records) {
    const ref = row.ReferenceNumber || row.InvoiceNo || row.PurchaseNumber;
    if (!ref) continue;
    if (!grouped[ref]) grouped[ref] = [];
    grouped[ref].push(row);
  }

  const results = { imported: 0, failed: 0, errors: [] };

  for (const [ref, rows] of Object.entries(grouped)) {
    try {
      await sequelize.transaction(async (transaction) => {
        const supplierName = rows[0].SupplierName;
        let supplier = await Supplier.findOne({ where: { supplierName, detstatus: false }, transaction });
        if (!supplier) {
          supplier = await Supplier.create({ supplierName, authadd: req.user.id }, { transaction });
        }

        const items = [];
        for (const row of rows) {
          const productIdent = row.ProductCode || row.ProductName;
          const product = await Product.findOne({
            where: {
              [Op.or]: [{ productCode: productIdent }, { productName: productIdent }],
              detstatus: false
            },
            transaction
          });
          if (!product) throw new Error(`Product ${productIdent} not found`);

          items.push({
            productId: product.id,
            quantity: Number(row.Quantity || 0),
            rate: Number(row.Rate || 0),
            gstPercent: Number(row.TaxPercent || 0),
            um: row.Unit || product.baseUm || 'PCS'
          });
        }

        const productIds = items.map(i => i.productId);
        const products = await Product.findAll({ where: { id: productIds }, transaction });
        const byId = new Map(products.map(p => [p.id, p]));

        const totals = calculateItems(items, byId);
        const purchaseDate = rows[0].Date || new Date().toISOString().slice(0, 10);

        const purchase = await Purchase.create({
          purchaseNumber: ref,
          purchaseDate,
          branchId: req.branchId,
          supplierId: supplier.id,
          createdBy: req.user.id,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,
          paidAmount: 0,
          paymentStatus: 'Unpaid',
          status: 'Received',
          notes: 'Imported via CSV bulk upload'
        }, { transaction });

        await PurchaseItem.bulkCreate(totals.items.map((item) => ({
          purchaseId: purchase.id,
          productId: item.productId,
          um: item.um,
          primaryUnit: item.primaryUnit,
          unitConversionFactor: item.unitConversionFactor,
          primaryQty: item.primaryQty,
          quantity: item.quantity,
          rate: item.rate,
          gstPercent: item.gstPercent,
          gstAmount: item.gstAmount,
          amount: item.amount
        })), { transaction });

        for (const item of totals.items) {
          await postStockTransaction({
            productId: item.productId,
            variantId: item.variantId || 0,
            branchId: req.branchId,
            quantity: Number(item.primaryQty),
            movementType: 'Purchase',
            referenceType: 'Purchase',
            referenceId: purchase.id,
            referenceNumber: purchase.purchaseNumber,
            unitCost: item.rate,
            transactionDate: purchase.purchaseDate,
            notes: `Bulk Imported ${purchase.purchaseNumber}`,
            transaction,
            userId: req.user.id,
          });
        }
        await postPurchase({ purchase, transaction, userId: req.user.id });
      });
      results.imported++;
    } catch (err) {
      results.failed++;
      results.errors.push(`Row Ref [${ref}]: ${err.message}`);
    }
  }

  res.json(results);
});
