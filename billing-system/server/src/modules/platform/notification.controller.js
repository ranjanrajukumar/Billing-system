import { Op } from 'sequelize';
import {
  Customer, Invoice, Payment, Product, Purchase, SalesReturn,
} from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { buildAlerts, summarise } from './notification.service.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

/**
 * The alert feed behind the bell: what needs attention right now.
 *
 * Scoped to the caller — their location, their approval queue, and only the
 * modules this company runs — so nobody is told about a workflow they do not
 * have or cannot act on.
 */
export const alerts = asyncHandler(async (req, res) => {
  const list = await buildAlerts({
    branchId: req.branchScope || null,
    role: req.user?.role,
    menus: req.user?.menus || [],
  });

  res.json({ alerts: list, counts: summarise(list) });
});

/**
 * Just the badge numbers. Split from the feed because the bell polls this and
 * the full list is considerably more work to build.
 */
export const alertCount = asyncHandler(async (req, res) => {
  const list = await buildAlerts({
    branchId: req.branchScope || null,
    role: req.user?.role,
    menus: req.user?.menus || [],
  });

  res.json(summarise(list));
});
const isoDate = (date) => date.toISOString().slice(0, 10);

function previousDay() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return isoDate(date);
}

/**
 * The summary shown on the first login of a day: what happened on the previous
 * business day, where stock stands now, and what needs reordering.
 */
export const dailyBriefing = asyncHandler(async (req, res) => {
  const day = req.query.date || previousDay();
  const live = { detstatus: false };

  const [
    invoices, purchases, returns, payments,
    products, outstandingRows, newCustomers,
  ] = await Promise.all([
    Invoice.findAll({
      where: { ...live, invoiceDate: day },
      attributes: ['id', 'invoiceNumber', 'grandTotal', 'status', 'paymentMethod'],
      raw: true,
    }),
    Purchase.findAll({
      where: { ...live, purchaseDate: day },
      attributes: ['id', 'purchaseNumber', 'grandTotal'],
      raw: true,
    }),
    SalesReturn.findAll({
      where: { ...live, returnDate: day },
      attributes: ['id', 'returnNumber', 'totalRefund'],
      raw: true,
    }),
    Payment.findAll({
      where: {
        detstatus: false,
        paidAt: { [Op.gte]: new Date(`${day}T00:00:00`), [Op.lte]: new Date(`${day}T23:59:59`) },
      },
      attributes: ['amount', 'paymentMethod'],
      raw: true,
    }),
    Product.findAll({
      where: { ...live, isActive: true },
      attributes: ['id', 'productName', 'stock', 'lowStockThreshold', 'sellingPrice'],
      order: [['stock', 'ASC']],
      raw: true,
    }),
    // Outstanding across every live invoice, less what has been paid.
    Invoice.findAll({
      where: { ...live, status: { [Op.in]: ['Unpaid', 'Partially Paid'] } },
      attributes: ['id', 'grandTotal'],
      include: [{ model: Payment, where: { detstatus: false }, required: false, attributes: ['amount'] }],
    }),
    Customer.count({ where: { ...live, addondt: { [Op.gte]: new Date(`${day}T00:00:00`), [Op.lte]: new Date(`${day}T23:59:59`) } } }),
  ]);

  const salesTotal = round2(invoices.reduce((sum, row) => sum + Number(row.grandTotal), 0));
  const creditSales = invoices.filter((row) => row.paymentMethod === 'Credit');
  const collected = round2(payments.reduce((sum, row) => sum + Number(row.amount), 0));

  const outstanding = round2(outstandingRows.reduce((sum, invoice) => {
    const paid = (invoice.Payments || []).reduce((s, p) => s + Number(p.amount), 0);
    return sum + (Number(invoice.grandTotal) - paid);
  }, 0));

  const outOfStock = products.filter((p) => Number(p.stock) <= 0);
  const lowStock = products.filter(
    (p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.lowStockThreshold || 0),
  );
  const stockValue = round2(products.reduce(
    (sum, p) => sum + Number(p.stock) * Number(p.sellingPrice || 0), 0,
  ));

  res.json({
    date: day,
    sales: {
      count: invoices.length,
      total: salesTotal,
      creditCount: creditSales.length,
      creditTotal: round2(creditSales.reduce((sum, row) => sum + Number(row.grandTotal), 0)),
      collected,
    },
    purchases: {
      count: purchases.length,
      total: round2(purchases.reduce((sum, row) => sum + Number(row.grandTotal), 0)),
    },
    returns: {
      count: returns.length,
      total: round2(returns.reduce((sum, row) => sum + Number(row.totalRefund), 0)),
    },
    customers: { added: newCustomers },
    receivables: { outstanding },
    stock: {
      products: products.length,
      units: products.reduce((sum, p) => sum + Number(p.stock), 0),
      value: stockValue,
      outOfStockCount: outOfStock.length,
      lowStockCount: lowStock.length,
    },
    // Most urgent first: nothing left, then closest to running out.
    alerts: [
      ...outOfStock.map((p) => ({
        productId: p.id, productName: p.productName, stock: Number(p.stock),
        threshold: Number(p.lowStockThreshold || 0), severity: 'out',
      })),
      ...lowStock.map((p) => ({
        productId: p.id, productName: p.productName, stock: Number(p.stock),
        threshold: Number(p.lowStockThreshold || 0), severity: 'low',
      })),
    ].slice(0, 25),
  });
});
