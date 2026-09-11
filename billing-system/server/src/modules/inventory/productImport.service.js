import fs from 'node:fs';
import { parse } from 'csv-parse';
import ExcelJS from 'exceljs';
import { Op } from 'sequelize';
import { Category, Product, ProductImportJob } from '../../models/index.js';
import { setBranchStock } from './stock.service.js';

const CHUNK_SIZE = Math.max(50, Number(process.env.PRODUCT_IMPORT_CHUNK_SIZE || 500));
const MAX_ERRORS = 200;
const running = new Set();

const expectedHeaders = ['productname', 'sku', 'barcode', 'purchaseprice', 'sellingprice', 'gstpercent', 'stock', 'hsncode', 'primaryunit', 'category'];
const normalise = (value) => String(value ?? '').trim();
const numeric = (value) => Number.parseFloat(value) || 0;

function rowFromValues(headers, values, rowNumber) {
  const get = (name) => values[headers[name]];
  const productName = normalise(get('productname'));
  if (!productName) return null;
  return {
    rowNumber,
    productName,
    sku: normalise(get('sku')) || null,
    barcode: normalise(get('barcode')) || null,
    purchasePrice: numeric(get('purchaseprice')),
    sellingPrice: numeric(get('sellingprice')),
    gstPercent: numeric(get('gstpercent')),
    stock: numeric(get('stock')),
    hsnCode: normalise(get('hsncode')),
    primaryUnit: normalise(get('primaryunit')) || 'PCS',
    categoryName: normalise(get('category')),
  };
}

async function* csvRows(filePath) {
  const parser = fs.createReadStream(filePath).pipe(parse({ bom: true, trim: true, relax_column_count: true }));
  let headers = null;
  let rowNumber = 0;
  for await (const values of parser) {
    rowNumber += 1;
    if (!headers) {
      headers = Object.fromEntries(values.map((value, index) => [normalise(value).toLowerCase(), index]));
      if (headers.productname === undefined) throw new Error('Missing required column: ProductName');
      continue;
    }
    const row = rowFromValues(headers, values, rowNumber);
    if (row) yield row;
  }
}

async function* xlsxRows(filePath) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, { worksheets: 'emit', sharedStrings: 'cache', styles: 'ignore' });
  let headers = null;
  let rowNumber = 0;
  for await (const sheet of reader) {
    for await (const row of sheet) {
      rowNumber += 1;
      const values = row.values.slice(1).map((value) => value?.text ?? value?.result ?? value);
      if (!headers) {
        headers = Object.fromEntries(values.map((value, index) => [normalise(value).toLowerCase(), index]));
        if (headers.productname === undefined) throw new Error('Missing required column: ProductName');
        continue;
      }
      const parsed = rowFromValues(headers, values, rowNumber);
      if (parsed) yield parsed;
    }
    break;
  }
  if (!headers) throw new Error('Spreadsheet is empty');
}

function rowsFor(filePath) {
  return filePath.toLowerCase().endsWith('.csv') ? csvRows(filePath) : xlsxRows(filePath);
}

async function ensureCategories(rows, userId) {
  const names = [...new Set(rows.map((row) => row.categoryName).filter(Boolean))];
  if (!names.length) return new Map();
  const existing = await Category.findAll({ where: { name: { [Op.in]: names } }, attributes: ['id', 'name'] });
  const categories = new Map(existing.map((category) => [category.name.toLowerCase(), category.id]));
  for (const name of names) {
    const key = name.toLowerCase();
    if (categories.has(key)) continue;
    const category = await Category.create({ name, description: 'Imported from spreadsheet', authlstedit: userId });
    categories.set(key, category.id);
  }
  return categories;
}

async function processChunk(job, rows) {
  const categories = await ensureCategories(rows, job.requestedBy);
  const skus = rows.map((row) => row.sku).filter(Boolean);
  const barcodes = rows.map((row) => row.barcode).filter(Boolean);
  const existing = (skus.length || barcodes.length) ? await Product.findAll({
    where: { detstatus: false, [Op.or]: [
      ...(skus.length ? [{ sku: { [Op.in]: skus } }] : []),
      ...(barcodes.length ? [{ barcode: { [Op.in]: barcodes } }] : []),
    ] },
  }) : [];
  const bySku = new Map(existing.filter((product) => product.sku).map((product) => [product.sku.toLowerCase(), product]));
  const byBarcode = new Map(existing.filter((product) => product.barcode).map((product) => [product.barcode.toLowerCase(), product]));
  const errors = [];
  let successCount = 0;

  for (const row of rows) {
    try {
      const product = (row.sku && bySku.get(row.sku.toLowerCase())) || (row.barcode && byBarcode.get(row.barcode.toLowerCase()));
      const payload = {
        productName: row.productName, sku: row.sku, barcode: row.barcode,
        purchasePrice: row.purchasePrice, sellingPrice: row.sellingPrice,
        gstPercent: row.gstPercent, hsnCode: row.hsnCode, primaryUnit: row.primaryUnit,
        categoryId: row.categoryName ? categories.get(row.categoryName.toLowerCase()) : null,
        authlstedit: job.requestedBy,
      };
      if (product) {
        await product.update(payload);
      } else {
        const created = await Product.create({ ...payload, stock: row.stock, authadd: job.requestedBy });
        if (row.stock > 0 && job.branchId) {
          await setBranchStock({ productId: created.id, branchId: job.branchId, quantity: row.stock, userId: job.requestedBy });
        }
        if (row.sku) bySku.set(row.sku.toLowerCase(), created);
        if (row.barcode) byBarcode.set(row.barcode.toLowerCase(), created);
      }
      successCount += 1;
    } catch (error) {
      errors.push(`Row ${row.rowNumber}: ${error.message}`);
    }
  }
  return { successCount, errors };
}

export function enqueueProductImport(jobId) {
  if (running.has(jobId)) return;
  running.add(jobId);
  void runProductImport(jobId).finally(() => running.delete(jobId));
}

export async function runProductImport(jobId) {
  const job = await ProductImportJob.findByPk(jobId);
  if (!job || !['Queued', 'Processing'].includes(job.status)) return;

  let successCount = Number(job.successCount || 0);
  let errorCount = Number(job.errorCount || 0);
  let processedRows = Number(job.processedRows || 0);
  const errors = Array.isArray(job.errors) ? job.errors : [];
  await job.update({ status: 'Processing', startedAt: job.startedAt || new Date(), message: 'Reading spreadsheet' });

  try {
    let chunk = [];
    for await (const row of rowsFor(job.filePath)) {
      chunk.push(row);
      if (chunk.length < CHUNK_SIZE) continue;
      const result = await processChunk(job, chunk);
      successCount += result.successCount;
      errorCount += result.errors.length;
      errors.push(...result.errors.slice(0, Math.max(0, MAX_ERRORS - errors.length)));
      processedRows += chunk.length;
      await job.update({ processedRows, successCount, errorCount, errors, message: `Processed ${processedRows.toLocaleString()} rows` });
      chunk = [];
    }
    if (chunk.length) {
      const result = await processChunk(job, chunk);
      successCount += result.successCount;
      errorCount += result.errors.length;
      errors.push(...result.errors.slice(0, Math.max(0, MAX_ERRORS - errors.length)));
      processedRows += chunk.length;
    }
    await job.update({ status: errorCount ? 'CompletedWithErrors' : 'Completed', processedRows, totalRows: processedRows, successCount, errorCount, errors, completedAt: new Date(), message: errorCount ? 'Import completed with row errors' : 'Import completed' });
  } catch (error) {
    await job.update({ status: 'Failed', message: error.message, completedAt: new Date() });
  } finally {
    fs.promises.unlink(job.filePath).catch(() => {});
  }
}

export async function resumeProductImports() {
  const jobs = await ProductImportJob.findAll({ where: { status: { [Op.in]: ['Queued', 'Processing'] } }, attributes: ['id'] });
  for (const job of jobs) enqueueProductImport(job.id);
}
