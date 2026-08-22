import { Op } from 'sequelize';
import {
  Branch, Brand, CashRegister, CashTransaction, Category, Company, Customer,
  Expense, ExpenseCategory, Grn, GrnItem, Invoice, InvoiceItem, Payment,
  Product, ProductBatch, Purchase, PurchaseItem, PurchaseOrder,
  PurchaseOrderItem, sequelize, StockTransfer, StockTransferItem, Supplier,
  Unit, User,
} from '../models/index.js';
import { postStockTransaction, setBranchStock } from '../modules/inventory/stock.service.js';
import { postPurchase, postSale, seedChartOfAccounts } from '../modules/accounting/accounting.service.js';
import { recordCashMovement } from '../modules/accounting/cash.service.js';
import { allocate, consume } from '../modules/inventory/batch.service.js';
import { calculateInvoice } from '../utils/invoiceMath.js';
import { unitSnapshot, priceFor } from '../utils/units.js';
import { withoutAudit } from '../modules/platform/audit.service.js';
import { invalidateConfig } from '../modules/platform/config.service.js';

/**
 * A worked example: a seed and agri-input shop.
 *
 * The point is not to fill tables but to leave the application in a state a
 * real shop would recognise — stock that came from somewhere, bills that
 * half-paid, lots that expire, a supplier still owed. Everything goes through
 * the same services the application uses, so the stock ledger, the party
 * ledgers and the accounts all agree with each other afterwards. Raw inserts
 * would be faster and would produce a demo that quietly disagrees with itself.
 *
 * Nothing is ever deleted. Every record is tagged with DEMO_TAG so a demo can
 * be told apart from real trading and removed deliberately.
 */

const DEMO_TAG = '[demo]';

// ---------------------------------------------------------------------------
// The shop
// ---------------------------------------------------------------------------

const CATEGORIES = ['Vegetable Seeds', 'Field Crop Seeds', 'Fertilisers', 'Crop Protection', 'Tools'];

const BRANDS = ['Mahyco', 'Nuziveedu', 'Syngenta', 'Coromandel', 'Local'];

const UNITS = [
  { name: 'Kilogram', code: 'KG' },
  { name: 'Gram', code: 'GM' },
  { name: 'Packet', code: 'PKT' },
  { name: 'Bag', code: 'BAG' },
  { name: 'Litre', code: 'LTR' },
  { name: 'Piece', code: 'PCS' },
];

/**
 * Seeds are sold by the packet but stocked by the gram; fertiliser is sold by
 * the bag but stocked by the kilo. That is exactly the case unit conversion
 * exists for, so the demo leans on it rather than avoiding it.
 */
const PRODUCTS = [
  {
    sku: 'VEG-TOM-001', productName: 'Tomato Seeds — Hybrid Arka Rakshak',
    category: 'Vegetable Seeds', brand: 'Mahyco', hsnCode: '1209',
    purchasePrice: 42, sellingPrice: 60, mrp: 75, wholesalePrice: 52, dealerPrice: 48,
    gstPercent: 5, primaryUnit: 'GM', secondaryUnit: 'PKT', unitConversionFactor: 10,
    secondarySellingPrice: 550, batchRequired: true, expiryRequired: true,
    reorderLevel: 500, reorderQuantity: 2000, openingStock: 0,
  },
  {
    sku: 'VEG-CHI-002', productName: 'Chilli Seeds — Guntur Sannam',
    category: 'Vegetable Seeds', brand: 'Nuziveedu', hsnCode: '1209',
    purchasePrice: 38, sellingPrice: 55, mrp: 68, wholesalePrice: 47, dealerPrice: 43,
    gstPercent: 5, primaryUnit: 'GM', secondaryUnit: 'PKT', unitConversionFactor: 10,
    secondarySellingPrice: 500, batchRequired: true, expiryRequired: true,
    reorderLevel: 400, reorderQuantity: 1500, openingStock: 0,
  },
  {
    sku: 'VEG-BRJ-003', productName: 'Brinjal Seeds — Pusa Purple',
    category: 'Vegetable Seeds', brand: 'Local', hsnCode: '1209',
    purchasePrice: 30, sellingPrice: 45, mrp: 55,
    gstPercent: 5, primaryUnit: 'GM', secondaryUnit: 'PKT', unitConversionFactor: 10,
    batchRequired: true, expiryRequired: true,
    reorderLevel: 300, reorderQuantity: 1000, openingStock: 0,
  },
  {
    sku: 'FLD-PAD-010', productName: 'Paddy Seeds — BPT 5204',
    category: 'Field Crop Seeds', brand: 'Nuziveedu', hsnCode: '1006',
    purchasePrice: 48, sellingPrice: 68, mrp: 80, wholesalePrice: 60, dealerPrice: 55,
    gstPercent: 5, primaryUnit: 'KG', secondaryUnit: 'BAG', unitConversionFactor: 30,
    secondarySellingPrice: 1950, batchRequired: true, expiryRequired: true,
    reorderLevel: 200, reorderQuantity: 900, openingStock: 0,
  },
  {
    sku: 'FLD-CTN-011', productName: 'Cotton Seeds — Bt Hybrid',
    category: 'Field Crop Seeds', brand: 'Mahyco', hsnCode: '1207',
    purchasePrice: 720, sellingPrice: 864, mrp: 864, dealerPrice: 800,
    gstPercent: 5, primaryUnit: 'PKT',
    batchRequired: true, expiryRequired: true,
    reorderLevel: 40, reorderQuantity: 200, openingStock: 0,
  },
  {
    sku: 'FLD-GRM-012', productName: 'Groundnut Seeds — TMV 7',
    category: 'Field Crop Seeds', brand: 'Local', hsnCode: '1202',
    purchasePrice: 85, sellingPrice: 110, mrp: 125, wholesalePrice: 98,
    gstPercent: 5, primaryUnit: 'KG', secondaryUnit: 'BAG', unitConversionFactor: 25,
    batchRequired: true, expiryRequired: true,
    reorderLevel: 150, reorderQuantity: 500, openingStock: 0,
  },
  {
    sku: 'FRT-UREA-020', productName: 'Urea 46% N',
    category: 'Fertilisers', brand: 'Coromandel', hsnCode: '3102',
    purchasePrice: 5.4, sellingPrice: 5.9, mrp: 6.5, wholesalePrice: 5.6,
    gstPercent: 5, primaryUnit: 'KG', secondaryUnit: 'BAG', unitConversionFactor: 45,
    secondarySellingPrice: 266, reorderLevel: 900, reorderQuantity: 4500, openingStock: 0,
  },
  {
    sku: 'FRT-DAP-021', productName: 'DAP 18-46-0',
    category: 'Fertilisers', brand: 'Coromandel', hsnCode: '3105',
    purchasePrice: 26, sellingPrice: 28.5, mrp: 31, wholesalePrice: 27.2,
    gstPercent: 5, primaryUnit: 'KG', secondaryUnit: 'BAG', unitConversionFactor: 50,
    secondarySellingPrice: 1425, reorderLevel: 500, reorderQuantity: 2500, openingStock: 0,
  },
  {
    sku: 'CPP-INS-030', productName: 'Imidacloprid 17.8% SL',
    category: 'Crop Protection', brand: 'Syngenta', hsnCode: '3808',
    purchasePrice: 310, sellingPrice: 420, mrp: 480, dealerPrice: 380,
    gstPercent: 18, primaryUnit: 'LTR',
    batchRequired: true, expiryRequired: true,
    reorderLevel: 20, reorderQuantity: 60, openingStock: 0,
  },
  {
    sku: 'CPP-FUN-031', productName: 'Mancozeb 75% WP',
    category: 'Crop Protection', brand: 'Syngenta', hsnCode: '3808',
    purchasePrice: 245, sellingPrice: 330, mrp: 375,
    gstPercent: 18, primaryUnit: 'KG',
    batchRequired: true, expiryRequired: true,
    reorderLevel: 25, reorderQuantity: 80, openingStock: 0,
  },
  {
    sku: 'TOO-SPR-040', productName: 'Knapsack Sprayer 16L',
    category: 'Tools', brand: 'Local', hsnCode: '8424',
    purchasePrice: 1150, sellingPrice: 1650, mrp: 1899, dealerPrice: 1450,
    gstPercent: 18, primaryUnit: 'PCS', serialRequired: true, warrantyMonths: 12,
    reorderLevel: 5, reorderQuantity: 20, openingStock: 0,
  },
  {
    sku: 'TOO-TRP-041', productName: 'Pheromone Trap',
    category: 'Tools', brand: 'Local', hsnCode: '3926',
    purchasePrice: 45, sellingPrice: 70, mrp: 85,
    gstPercent: 18, primaryUnit: 'PCS',
    reorderLevel: 50, reorderQuantity: 200, openingStock: 0,
  },
];

const SUPPLIERS = [
  { supplierName: 'Mahyco Seeds Pvt Ltd', contactPerson: 'R Venkatesh', mobileNumber: '9840011001', city: 'Hyderabad', state: 'Telangana', gstNumber: '36AABCM1234A1Z5', creditDays: 30 },
  { supplierName: 'Nuziveedu Seeds Ltd', contactPerson: 'S Prasad', mobileNumber: '9840011002', city: 'Hyderabad', state: 'Telangana', gstNumber: '36AACCN5678B1Z2', creditDays: 45 },
  { supplierName: 'Coromandel International', contactPerson: 'K Murthy', mobileNumber: '9840011003', city: 'Chennai', state: 'Tamil Nadu', gstNumber: '33AAACC9012C1Z8', creditDays: 21 },
  { supplierName: 'Syngenta India Ltd', contactPerson: 'A Joseph', mobileNumber: '9840011004', city: 'Pune', state: 'Maharashtra', gstNumber: '27AAACS3456D1Z1', creditDays: 30 },
];

const CUSTOMERS = [
  { customerName: 'Walk-in Customer', mobileNumber: '0000000000', city: 'Erode', state: 'Tamil Nadu', priceTier: 'Retail' },
  { customerName: 'Murugan (Farmer)', mobileNumber: '9842200101', city: 'Erode', state: 'Tamil Nadu', priceTier: 'Retail' },
  { customerName: 'Selvam (Farmer)', mobileNumber: '9842200102', city: 'Bhavani', state: 'Tamil Nadu', priceTier: 'Retail' },
  { customerName: 'Lakshmi Agri Traders', mobileNumber: '9842200103', city: 'Salem', state: 'Tamil Nadu', gstNumber: '33AAAFL1234E1Z9', priceTier: 'Wholesale' },
  { customerName: 'Anbu Seeds & Fertilisers', mobileNumber: '9842200104', city: 'Coimbatore', state: 'Tamil Nadu', gstNumber: '33AAAFA5678F1Z3', priceTier: 'Dealer' },
  { customerName: 'Kannan (Farmer)', mobileNumber: '9842200105', city: 'Gobi', state: 'Tamil Nadu', priceTier: 'Retail' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const daysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

/** A lot number in the shape a seed company actually prints on the bag. */
const lotNumber = (sku, index) => `${sku.split('-')[1]}${new Date().getFullYear()}${String(index).padStart(3, '0')}`;

async function nextNumber(model, field, prefix, transaction) {
  const year = new Date().getFullYear();
  const count = await model.count({ where: { [field]: { [Op.like]: `${prefix}-${year}-%` } }, transaction });
  return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** Masters: categories, brands, units, parties. */
async function seedMasters(userId, log) {
  const categories = new Map();
  for (const name of CATEGORIES) {
    const [row] = await Category.findOrCreate({ where: { name }, defaults: { name } });
    categories.set(name, row);
  }

  const brands = new Map();
  for (const name of BRANDS) {
    const [row] = await Brand.findOrCreate({ where: { name }, defaults: { name } });
    brands.set(name, row);
  }

  for (const unit of UNITS) {
    await Unit.findOrCreate({ where: { name: unit.name }, defaults: unit });
  }

  const suppliers = new Map();
  for (const supplier of SUPPLIERS) {
    const [row] = await Supplier.findOrCreate({
      where: { supplierName: supplier.supplierName },
      defaults: { ...supplier, authadd: userId },
    });
    suppliers.set(supplier.supplierName, row);
  }

  const customers = new Map();
  for (const customer of CUSTOMERS) {
    const [row] = await Customer.findOrCreate({
      where: { customerName: customer.customerName },
      defaults: { ...customer, address: customer.city, pincode: '638001', authadd: userId },
    });
    customers.set(customer.customerName, row);
  }

  log(`Masters: ${categories.size} categories, ${brands.size} brands, ${suppliers.size} suppliers, ${customers.size} customers`);
  return { categories, brands, suppliers, customers };
}

/** The catalogue. Stock is deliberately left at zero — it arrives by purchase. */
async function seedProducts({ categories, brands }, userId, log) {
  const products = new Map();

  for (const spec of PRODUCTS) {
    const { category, brand, openingStock, ...columns } = spec;
    const [row] = await Product.findOrCreate({
      where: { sku: spec.sku },
      defaults: {
        ...columns,
        categoryId: categories.get(category)?.id ?? null,
        brandId: brands.get(brand)?.id ?? null,
        stock: 0,
        lowStockThreshold: Math.round((spec.reorderLevel || 10) / 2),
        minimumStock: Math.round((spec.reorderLevel || 10) / 2),
        isActive: true,
        authadd: userId,
      },
    });
    products.set(spec.sku, row);
  }

  log(`Catalogue: ${products.size} products, stock starts at zero and arrives by purchase`);
  return products;
}

/**
 * Buying stock in. Goes through the stock engine, so every unit that appears
 * on a shelf has a ledger row explaining where it came from.
 */
async function seedPurchases({ products, suppliers }, branchId, userId, transaction, log) {
  const plan = [
    { sku: 'VEG-TOM-001', supplier: 'Mahyco Seeds Pvt Ltd', qty: 300, um: 'PKT', rate: 420, lots: 2, expiryDays: 210 },
    { sku: 'VEG-CHI-002', supplier: 'Nuziveedu Seeds Ltd', qty: 250, um: 'PKT', rate: 380, lots: 2, expiryDays: 180 },
    { sku: 'VEG-BRJ-003', supplier: 'Nuziveedu Seeds Ltd', qty: 150, um: 'PKT', rate: 300, lots: 1, expiryDays: 45 },
    { sku: 'FLD-PAD-010', supplier: 'Nuziveedu Seeds Ltd', qty: 40, um: 'BAG', rate: 1440, lots: 2, expiryDays: 300 },
    { sku: 'FLD-CTN-011', supplier: 'Mahyco Seeds Pvt Ltd', qty: 120, um: 'PKT', rate: 720, lots: 1, expiryDays: 365 },
    { sku: 'FLD-GRM-012', supplier: 'Coromandel International', qty: 30, um: 'BAG', rate: 2125, lots: 1, expiryDays: 120 },
    { sku: 'FRT-UREA-020', supplier: 'Coromandel International', qty: 120, um: 'BAG', rate: 243, lots: 0 },
    { sku: 'FRT-DAP-021', supplier: 'Coromandel International', qty: 60, um: 'BAG', rate: 1300, lots: 0 },
    { sku: 'CPP-INS-030', supplier: 'Syngenta India Ltd', qty: 45, um: 'LTR', rate: 310, lots: 1, expiryDays: 500 },
    { sku: 'CPP-FUN-031', supplier: 'Syngenta India Ltd', qty: 40, um: 'KG', rate: 245, lots: 1, expiryDays: 400 },
    { sku: 'TOO-SPR-040', supplier: 'Coromandel International', qty: 12, um: 'PCS', rate: 1150, lots: 0 },
    { sku: 'TOO-TRP-041', supplier: 'Coromandel International', qty: 150, um: 'PCS', rate: 45, lots: 0 },
  ];

  // Grouped by supplier so the demo has a handful of realistic bills rather
  // than one line per document.
  const bySupplier = new Map();
  for (const line of plan) {
    if (!bySupplier.has(line.supplier)) bySupplier.set(line.supplier, []);
    bySupplier.get(line.supplier).push(line);
  }

  let created = 0;
  for (const [supplierName, lines] of bySupplier) {
    const supplier = suppliers.get(supplierName);
    const priced = lines.map((line) => {
      const product = products.get(line.sku);
      const taxable = line.qty * line.rate;
      const gstAmount = taxable * Number(product.gstPercent) / 100;
      return {
        ...line, product, taxable, gstAmount,
        ...unitSnapshot(product, line.um, line.qty),
      };
    });

    const subtotal = priced.reduce((sum, l) => sum + l.taxable, 0);
    const taxAmount = priced.reduce((sum, l) => sum + l.gstAmount, 0);
    const grandTotal = subtotal + taxAmount;
    // One bill is left part-paid so the supplier ledger has something to show.
    const paidAmount = supplierName === 'Syngenta India Ltd' ? 0 : Math.round(grandTotal * 0.6);

    const purchase = await Purchase.create({
      purchaseNumber: await nextNumber(Purchase, 'purchaseNumber', 'PO', transaction),
      purchaseDate: daysFromNow(-21),
      branchId,
      supplierId: supplier.id,
      createdBy: userId,
      subtotal, taxAmount, grandTotal, paidAmount,
      paymentStatus: paidAmount >= grandTotal ? 'Paid' : paidAmount > 0 ? 'Partially Paid' : 'Unpaid',
      status: 'Received',
      notes: `${DEMO_TAG} opening purchase`,
      authadd: userId,
    }, { transaction });

    await PurchaseItem.bulkCreate(priced.map((l) => ({
      purchaseId: purchase.id,
      productId: l.product.id,
      quantity: l.qty,
      rate: l.rate,
      gstPercent: l.product.gstPercent,
      gstAmount: l.gstAmount,
      amount: l.taxable + l.gstAmount,
      um: l.um,
      primaryUnit: l.primaryUnit,
      unitConversionFactor: l.unitConversionFactor,
      primaryQty: l.primaryQty,
      authadd: userId,
    })), { transaction });

    for (const line of priced) {
      // Seed lots: the bag carries a lot number, a germination percentage and
      // a date after which it must not be sown.
      if (line.lots > 0) {
        const perLot = Math.floor(line.primaryQty / line.lots);
        for (let i = 0; i < line.lots; i += 1) {
          const quantity = i === line.lots - 1 ? line.primaryQty - perLot * (line.lots - 1) : perLot;
          await ProductBatch.create({
            productId: line.product.id,
            branchId,
            batchNumber: lotNumber(line.sku, i + 1),
            lotNumber: lotNumber(line.sku, i + 1),
            // A near-expiry lot on one product gives the expiry report something to say.
            germinationPercent: 85 + i * 3,
            purity: 98,
            packingDate: daysFromNow(-60),
            expiryDate: daysFromNow(line.expiryDays - i * 30),
            quantity,
            purchaseRate: line.rate,
            supplierName,
            notes: DEMO_TAG,
            authadd: userId,
          }, { transaction });
        }
      }

      await postStockTransaction({
        productId: line.product.id,
        branchId,
        quantity: line.primaryQty,
        movementType: 'Purchase',
        referenceType: 'Purchase',
        referenceId: purchase.id,
        referenceNumber: purchase.purchaseNumber,
        unitCost: line.rate,
        transactionDate: purchase.purchaseDate,
        notes: `${DEMO_TAG} ${line.qty} ${line.um} received`,
        transaction,
        userId,
      });
    }

    await postPurchase({ purchase, transaction, userId });
    created += 1;
  }

  log(`Purchases: ${created} supplier bills, stock received with lots and ledger rows`);
}

/**
 * Selling. A mix of cash counter sales and credit to the trade, so the
 * customer ledger shows both settled and outstanding accounts.
 */
async function seedSales({ products, customers }, branchId, userId, companyState, transaction, log) {
  const plan = [
    { customer: 'Murugan (Farmer)', daysAgo: 14, method: 'Cash', lines: [
      { sku: 'VEG-TOM-001', qty: 5, um: 'PKT' },
      { sku: 'FRT-UREA-020', qty: 2, um: 'BAG' },
    ]},
    { customer: 'Selvam (Farmer)', daysAgo: 11, method: 'UPI', lines: [
      { sku: 'FLD-PAD-010', qty: 3, um: 'BAG' },
      { sku: 'CPP-INS-030', qty: 2, um: 'LTR' },
    ]},
    { customer: 'Lakshmi Agri Traders', daysAgo: 9, method: 'Credit', lines: [
      { sku: 'VEG-CHI-002', qty: 40, um: 'PKT' },
      { sku: 'FRT-DAP-021', qty: 10, um: 'BAG' },
    ]},
    { customer: 'Anbu Seeds & Fertilisers', daysAgo: 6, method: 'Credit', lines: [
      { sku: 'FLD-CTN-011', qty: 25, um: 'PKT' },
      { sku: 'TOO-SPR-040', qty: 2, um: 'PCS' },
    ]},
    { customer: 'Kannan (Farmer)', daysAgo: 3, method: 'Cash', lines: [
      { sku: 'TOO-TRP-041', qty: 10, um: 'PCS' },
      { sku: 'CPP-FUN-031', qty: 2, um: 'KG' },
    ]},
    { customer: 'Walk-in Customer', daysAgo: 1, method: 'Cash', lines: [
      { sku: 'VEG-BRJ-003', qty: 3, um: 'PKT' },
    ]},
  ];

  let created = 0;
  for (const sale of plan) {
    const customer = customers.get(sale.customer);
    const invoiceDate = daysFromNow(-sale.daysAgo);

    const items = sale.lines.map((line) => {
      const product = products.get(line.sku);
      return {
        productId: product.id,
        quantity: line.qty,
        rate: priceFor(product, { tier: customer.priceTier, billedUnit: line.um }),
        gstPercent: Number(product.gstPercent),
        mrp: product.mrp,
        ...unitSnapshot(product, line.um, line.qty),
      };
    });

    const totals = calculateInvoice(items, customer.state, companyState);

    const invoice = await Invoice.create({
      invoiceNumber: await nextNumber(Invoice, 'invoiceNumber', 'INV', transaction),
      invoiceDate,
      branchId,
      customerId: customer.id,
      paymentMethod: sale.method,
      createdBy: userId,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      grandTotal: totals.grandTotal,
      roundOff: totals.roundOff,
      amountInWords: totals.amountInWords,
      status: sale.method === 'Credit' ? 'Unpaid' : 'Paid',
      dueDate: sale.method === 'Credit' ? daysFromNow(30 - sale.daysAgo) : null,
      notes: `${DEMO_TAG} counter sale`,
      authadd: userId,
    }, { transaction });

    // Lots have to be drawn down as well as stock. The invoice controller does
    // this with allocate/consume; skipping it here left the lots holding the
    // full purchased quantity while the shelf figure fell — a discrepancy the
    // stock audit rightly flags.
    const lotRows = [];
    for (const item of totals.items) {
      const allocations = await allocate({
        productId: item.productId,
        branchId,
        quantity: Number(item.primaryQty || item.quantity),
        transaction,
      });

      if (!allocations.length) {
        lotRows.push({ item, share: 1, batch: null });
        continue;
      }

      await consume(allocations, { transaction, userId });
      const totalPrimary = Number(item.primaryQty || item.quantity) || 1;
      for (const allocation of allocations) {
        lotRows.push({ item, share: allocation.quantity / totalPrimary, batch: allocation.batch });
      }
    }

    await InvoiceItem.bulkCreate(lotRows.map(({ item, share, batch }) => ({
      invoiceId: invoice.id,
      productId: item.productId,
      // A line split across two lots still sums to the original quantity
      // and the original money.
      quantity: Number(item.quantity) * share,
      rate: item.rate,
      discount: Number(item.discount || 0) * share,
      gstPercent: item.gstPercent,
      gstAmount: Number(item.gstAmount) * share,
      amount: Number(item.amount) * share,
      um: item.um,
      mrp: item.mrp,
      primaryUnit: item.primaryUnit,
      unitConversionFactor: item.unitConversionFactor,
      primaryQty: Number(item.primaryQty || item.quantity) * share,
      batchId: batch?.id || null,
      batchNumber: batch?.batchNumber || null,
      germinationPercent: batch?.germinationPercent ?? null,
      expiryDate: batch?.expiryDate || null,
      authadd: userId,
    })), { transaction });

    for (const item of totals.items) {
      await postStockTransaction({
        productId: item.productId,
        branchId,
        quantity: -Number(item.primaryQty || item.quantity),
        movementType: 'Sale',
        referenceType: 'Invoice',
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        transactionDate: invoiceDate,
        notes: `${DEMO_TAG} sold ${item.quantity} ${item.um}`,
        transaction,
        userId,
      });
    }

    if (sale.method !== 'Credit') {
      await Payment.create({
        invoiceId: invoice.id,
        amount: totals.grandTotal,
        paymentMethod: sale.method,
        paidAt: invoiceDate,
        authadd: userId,
      }, { transaction });
    } else if (sale.customer === 'Lakshmi Agri Traders') {
      // A part payment, so the ledger shows a running balance rather than a
      // wall of untouched invoices.
      await Payment.create({
        invoiceId: invoice.id,
        amount: Math.round(Number(totals.grandTotal) * 0.4),
        paymentMethod: 'Bank Transfer',
        paidAt: daysFromNow(-4),
        authadd: userId,
      }, { transaction });
      await invoice.update({ status: 'Partially Paid' }, { transaction });
    }

    const costOfGoods = totals.items.reduce((sum, item) => {
      const product = [...products.values()].find((p) => p.id === item.productId);
      return sum + Number(product?.purchasePrice || 0) * Number(item.primaryQty || item.quantity);
    }, 0);
    await postSale({ invoice, costOfGoods, transaction, userId });

    created += 1;
  }

  log(`Sales: ${created} invoices — cash, UPI and credit, one part-paid`);
}

// ---------------------------------------------------------------------------
// Advanced extras
// ---------------------------------------------------------------------------

/** A warehouse holding bulk stock, and a transfer of some of it to the shop. */
async function seedWarehouseFlow({ products, suppliers }, branchId, userId, transaction, log) {
  const [warehouse] = await Branch.findOrCreate({
    where: { branchCode: 'WH-MAIN' },
    defaults: {
      branchName: 'Godown — Perundurai Road',
      branchCode: 'WH-MAIN',
      locationType: 'Warehouse',
      canSell: false,
      city: 'Erode',
      state: 'Tamil Nadu',
      isActive: true,
      isDefault: false,
    },
    transaction,
  });

  // Bulk fertiliser arrives at the godown, not the shop.
  const bulk = [
    { sku: 'FRT-UREA-020', qty: 200, um: 'BAG', rate: 243 },
    { sku: 'FRT-DAP-021', qty: 100, um: 'BAG', rate: 1300 },
  ];

  for (const line of bulk) {
    const product = products.get(line.sku);
    const snapshot = unitSnapshot(product, line.um, line.qty);
    await postStockTransaction({
      productId: product.id,
      branchId: warehouse.id,
      quantity: snapshot.primaryQty,
      movementType: 'Opening Stock',
      referenceType: 'Demo Opening',
      referenceNumber: 'DEMO-WH',
      unitCost: line.rate,
      notes: `${DEMO_TAG} bulk stock at the godown`,
      transaction,
      userId,
    });
  }

  // A transfer that has been dispatched but not yet received, so the demo has
  // stock genuinely in transit — the state the workflow exists to represent.
  const transfer = await StockTransfer.create({
    transferNumber: await nextNumber(StockTransfer, 'transferNumber', 'TRF', transaction),
    transferDate: daysFromNow(-2),
    fromBranchId: warehouse.id,
    toBranchId: branchId,
    status: 'InTransit',
    requestedBy: userId,
    approvedBy: userId,
    approvedAt: new Date(),
    dispatchedBy: userId,
    dispatchedAt: new Date(),
    transporter: 'Sri Balaji Lorry Service',
    vehicleNo: 'TN 33 AB 1234',
    totalQuantity: 0,
    remarks: `${DEMO_TAG} godown to shop`,
    authadd: userId,
  }, { transaction });

  let totalQuantity = 0;
  for (const line of [{ sku: 'FRT-UREA-020', qty: 40, um: 'BAG' }, { sku: 'FRT-DAP-021', qty: 20, um: 'BAG' }]) {
    const product = products.get(line.sku);
    const snapshot = unitSnapshot(product, line.um, line.qty);

    await StockTransferItem.create({
      transferId: transfer.id,
      productId: product.id,
      quantity: snapshot.primaryQty,
      dispatchedQty: snapshot.primaryQty,
      receivedQty: 0,
      unitCost: product.purchasePrice,
      um: product.primaryUnit,
      authadd: userId,
    }, { transaction });

    await postStockTransaction({
      productId: product.id,
      branchId: warehouse.id,
      quantity: -snapshot.primaryQty,
      movementType: 'Transfer Out',
      referenceType: 'Stock Transfer',
      referenceId: transfer.id,
      referenceNumber: transfer.transferNumber,
      notes: `${DEMO_TAG} dispatched to the shop`,
      transaction,
      userId,
    });
    totalQuantity += snapshot.primaryQty;
  }

  await transfer.update({ totalQuantity }, { transaction });
  log(`Warehouse: godown stocked, transfer ${transfer.transferNumber} left in transit for receiving`);
  return warehouse;
}

/** An open purchase order with a partial receipt against it. */
async function seedPurchaseOrderFlow({ products, suppliers }, branchId, userId, transaction, log) {
  const supplier = suppliers.get('Mahyco Seeds Pvt Ltd');
  const product = products.get('VEG-TOM-001');
  const orderedQty = 200;
  const rate = 420;
  const taxable = orderedQty * rate;
  const gstAmount = taxable * Number(product.gstPercent) / 100;

  const order = await PurchaseOrder.create({
    poNumber: await nextNumber(PurchaseOrder, 'poNumber', 'PORD', transaction),
    poDate: daysFromNow(-7),
    // Deliberately overdue: the balance of 50 packets was due two days ago and
    // has not arrived. Chasing a late supplier is a real job, and the demo
    // cannot show that alert without an order that is actually late.
    expectedDate: daysFromNow(-2),
    supplierId: supplier.id,
    branchId,
    status: 'Partially Received',
    subtotal: taxable,
    taxAmount: gstAmount,
    grandTotal: taxable + gstAmount,
    approvedBy: userId,
    approvedAt: new Date(),
    createdBy: userId,
    notes: `${DEMO_TAG} season stocking order`,
    authadd: userId,
  }, { transaction });

  const orderItem = await PurchaseOrderItem.create({
    poId: order.id,
    productId: product.id,
    quantity: orderedQty,
    receivedQty: 150,
    rate,
    gstPercent: product.gstPercent,
    gstAmount,
    amount: taxable + gstAmount,
    um: 'PKT',
    primaryUnit: product.primaryUnit,
    unitConversionFactor: product.unitConversionFactor,
    authadd: userId,
  }, { transaction });

  const grn = await Grn.create({
    grnNumber: await nextNumber(Grn, 'grnNumber', 'GRN', transaction),
    grnDate: daysFromNow(-4),
    poId: order.id,
    supplierId: supplier.id,
    branchId,
    status: 'Completed',
    supplierInvoiceNo: 'MSPL/2026/8891',
    supplierInvoiceDate: daysFromNow(-5),
    transporter: 'VRL Logistics',
    vehicleNo: 'KA 25 C 7788',
    receivedBy: userId,
    postedAt: new Date(),
    remarks: `${DEMO_TAG} short delivery, three packets damaged`,
    authadd: userId,
  }, { transaction });

  // 150 received, 145 accepted, 2 rejected on inspection, 3 damaged in transit.
  const acceptedQty = 145;
  await GrnItem.create({
    grnId: grn.id,
    poItemId: orderItem.id,
    productId: product.id,
    orderedQty,
    receivedQty: 150,
    acceptedQty,
    rejectedQty: 2,
    damagedQty: 3,
    rate,
    gstPercent: product.gstPercent,
    um: 'PKT',
    primaryUnit: product.primaryUnit,
    unitConversionFactor: product.unitConversionFactor,
    batchNumber: lotNumber('VEG-TOM-001', 9),
    expiryDate: daysFromNow(240),
    germinationPercent: 88,
    rejectionReason: 'Torn packets',
    authadd: userId,
  }, { transaction });

  const snapshot = unitSnapshot(product, 'PKT', acceptedQty);
  await ProductBatch.create({
    productId: product.id,
    branchId,
    batchNumber: lotNumber('VEG-TOM-001', 9),
    lotNumber: lotNumber('VEG-TOM-001', 9),
    germinationPercent: 88,
    purity: 98,
    expiryDate: daysFromNow(240),
    quantity: snapshot.primaryQty,
    purchaseRate: rate,
    supplierName: supplier.supplierName,
    notes: DEMO_TAG,
    authadd: userId,
  }, { transaction });

  await postStockTransaction({
    productId: product.id,
    branchId,
    quantity: snapshot.primaryQty,
    movementType: 'GRN',
    referenceType: 'GRN',
    referenceId: grn.id,
    referenceNumber: grn.grnNumber,
    unitCost: rate,
    transactionDate: grn.grnDate,
    notes: `${DEMO_TAG} accepted ${acceptedQty} of 150 PKT`,
    transaction,
    userId,
  });

  log(`Purchasing: order ${order.poNumber} part-received on ${grn.grnNumber} (145 of 150 accepted), 50 still due`);
}

/** Running costs and a till, so the cash and expense screens have content. */
async function seedMoneyFlow(branchId, userId, transaction, log) {
  const categories = new Map();
  for (const name of ['Rent', 'Electricity', 'Transport', 'Salary']) {
    const [row] = await ExpenseCategory.findOrCreate({ where: { name }, defaults: { name }, transaction });
    categories.set(name, row);
  }

  const register = await CashRegister.create({
    registerName: 'Front Counter',
    branchId,
    status: 'Open',
    openedBy: userId,
    openedAt: new Date(),
    openingBalance: 5000,
    remarks: `${DEMO_TAG} today's float`,
    authadd: userId,
  }, { transaction });

  // Written directly rather than through recordCashMovement, exactly as the
  // register controller does: the opening row *is* the starting balance, so
  // adding it as a movement on top of `openingBalance` would count it twice.
  await CashTransaction.create({
    registerId: register.id,
    branchId,
    entryType: 'Opening',
    transactionDate: new Date(),
    amountIn: 5000,
    amountOut: 0,
    balance: 5000,
    notes: `${DEMO_TAG} opening float`,
    authadd: userId,
  }, { transaction });

  const expenses = [
    { name: 'Rent', amount: 18000, payee: 'Shop landlord', daysAgo: 5 },
    { name: 'Electricity', amount: 3400, payee: 'TNEB', daysAgo: 3 },
    { name: 'Transport', amount: 2200, payee: 'Sri Balaji Lorry Service', daysAgo: 2 },
  ];

  for (const spec of expenses) {
    const expense = await Expense.create({
      expenseNumber: await nextNumber(Expense, 'expenseNumber', 'EXP', transaction),
      expenseDate: daysFromNow(-spec.daysAgo),
      branchId,
      categoryId: categories.get(spec.name).id,
      status: 'Paid',
      amount: spec.amount,
      taxAmount: 0,
      totalAmount: spec.amount,
      paymentMode: 'Cash',
      cashRegisterId: register.id,
      paidAt: new Date(),
      payeeName: spec.payee,
      approvedBy: userId,
      approvedAt: new Date(),
      createdBy: userId,
      remarks: DEMO_TAG,
      authadd: userId,
    }, { transaction });

    await recordCashMovement({
      registerId: register.id,
      entryType: 'Expense',
      amountOut: spec.amount,
      referenceType: 'Expense',
      referenceId: expense.id,
      referenceNumber: expense.expenseNumber,
      partyName: spec.payee,
      transaction,
      userId,
    });
  }

  log(`Money: till open with a float, ${expenses.length} expenses paid from it`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Seeds the demo shop.
 *
 * `mode` decides how far it goes: 'basic' stops at products, purchases and
 * sales — everything a counter shop uses. 'advanced' adds the godown, the
 * order-to-receipt chain, the till and the accounts.
 */
export async function seedDemoShop({ mode = 'basic', userId = null, log = console.log } = {}) {
  const advanced = mode === 'advanced';

  const branch = await Branch.findOne({ where: { isDefault: true, detstatus: false } })
    || await Branch.findOne({ where: { detstatus: false } });
  if (!branch) throw new Error('No branch exists yet — run the migration first.');

  const admin = userId
    ? { id: userId }
    : await User.findOne({ where: { detstatus: false }, order: [['id', 'ASC']] });

  const company = await Company.findOne();
  const companyState = company?.state || 'Tamil Nadu';

  log(`Seeding a seeds shop in ${advanced ? 'Advanced' : 'Basic'} mode at "${branch.branchName}"…`);

  // The mode has to be switched *before* any trading is seeded, not after.
  // Automatic accounting entries are skipped whenever the accounting module is
  // off, so seeding an Advanced demo while the company was still Basic left the
  // chart of accounts in place and every sale and purchase unposted — books
  // that balance only because they are empty.
  if (advanced && company && company.businessMode !== 'Advanced') {
    await company.update({ businessMode: 'Advanced' });
    invalidateConfig();
    log('Switched the company to Advanced mode so the books actually post');
  }

  // Masters and the catalogue are created outside the transaction: they are
  // findOrCreate and safe to re-run, and keeping them out shortens the lock
  // held over the trading data.
  const masters = await withoutAudit(() => seedMasters(admin?.id, log));
  const products = await withoutAudit(() => seedProducts(masters, admin?.id, log));

  if (advanced) await seedChartOfAccounts();

  await sequelize.transaction(async (transaction) => {
    await seedPurchases({ products, suppliers: masters.suppliers }, branch.id, admin?.id, transaction, log);
    await seedSales(
      { products, customers: masters.customers },
      branch.id, admin?.id, companyState, transaction, log,
    );

    if (advanced) {
      await seedWarehouseFlow({ products, suppliers: masters.suppliers }, branch.id, admin?.id, transaction, log);
      await seedPurchaseOrderFlow({ products, suppliers: masters.suppliers }, branch.id, admin?.id, transaction, log);
      await seedMoneyFlow(branch.id, admin?.id, transaction, log);
    }
  });

  // The mirrored product totals are recomputed by the stock engine as it goes,
  // so this only reports what the demo ended up holding.
  const held = await Product.sum('stock', { where: { detstatus: false } });
  log(`Done. ${products.size} products, ${Number(held || 0).toLocaleString('en-IN')} units in stock.`);

  return { branchId: branch.id, products: products.size, mode };
}

/** Whether this database already looks like it has been traded in. */
export async function hasTradingData() {
  const [invoices, purchases] = await Promise.all([
    Invoice.count({ where: { detstatus: false } }),
    Purchase.count({ where: { detstatus: false } }),
  ]);
  return { invoices, purchases, any: invoices > 0 || purchases > 0 };
}
