import { Op, fn, col } from 'sequelize';
import { Customer, Invoice, Product, InvoiceItem } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { operationsSummary } from './operationsSummary.service.js';
// Aliased: this file already has its own resolvePeriod for the month/year
// product-performance contract, which is a different vocabulary.
import { resolvePeriod as resolveNamedPeriod, withDateRange } from '../../utils/dateRange.js';

const pad2 = (n) => String(n).padStart(2, '0');
const lastDayOf = (year, month) => new Date(year, month, 0).getDate();

/**
 * Turns ?period=month&value=2026-08 (or ?period=year&value=2026) into a date
 * range. Anything unparseable falls back to the current month or year, so a
 * bad query string still returns a sensible board rather than an error.
 */
function resolvePeriod(query) {
  const now = new Date();
  const period = ['year', 'quarter'].includes(query.period) ? query.period : 'month';

  if (period === 'year') {
    const year = /^\d{4}$/.test(String(query.value)) ? Number(query.value) : now.getFullYear();
    return { period, value: String(year), label: String(year), from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const match = /^(\d{4})-(\d{2})$/.exec(String(query.value || ''));
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match && Number(match[2]) >= 1 && Number(match[2]) <= 12
    ? Number(match[2])
    : now.getMonth() + 1;
  const value = `${year}-${pad2(month)}`;
  const endLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const to = `${value}-${pad2(lastDayOf(year, month))}`;

  if (period === 'quarter') {
    // The three months ending with the chosen one, so "3 months to August"
    // covers June, July and August.
    const start = new Date(year, month - 3, 1);
    const from = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-01`;
    const startLabel = start.toLocaleDateString('en-IN', { month: 'short' });
    return { period, value, label: `${startLabel} – ${endLabel}`, from, to };
  }

  return { period, value, label: endLabel, from: `${value}-01`, to };
}

/**
 * Best and worst selling products over a month or a year.
 *
 * Products that sold nothing at all are the most useful entries in the "low
 * selling" list, and they have no invoice lines to group by — so the ranking is
 * built from the full catalogue with sales merged in, not from the sales alone.
 */
export const productPerformance = asyncHandler(async (req, res) => {
  const { period, value, label, from, to } = resolvePeriod(req.query);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

  const [products, soldRows] = await Promise.all([
    Product.findAll({
      where: { detstatus: false },
      attributes: ['id', 'productName', 'hsnCode', 'stock', 'sellingPrice'],
      raw: true,
    }),
    InvoiceItem.findAll({
      attributes: [
        'productId',
        [fn('SUM', col('InvoiceItem.quantity')), 'quantity'],
        [fn('SUM', col('InvoiceItem.amount')), 'revenue'],
        [fn('COUNT', fn('DISTINCT', col('InvoiceItem.invoice_id'))), 'invoiceCount'],
      ],
      include: [{
        model: Invoice,
        attributes: [],
        required: true,
        // Cancelled invoices are soft-deleted, so this drops them from the count.
        where: { detstatus: false, invoiceDate: { [Op.between]: [from, to] } },
      }],
      group: ['InvoiceItem.product_id'],
      raw: true,
    }),
  ]);

  const soldById = new Map(soldRows.map((row) => [row.productId, row]));
  const ranked = products.map((product) => {
    const sold = soldById.get(product.id);
    return {
      id: product.id,
      productName: product.productName,
      hsnCode: product.hsnCode,
      stock: Number(product.stock || 0),
      quantity: Number(sold?.quantity || 0),
      revenue: Number(sold?.revenue || 0),
      invoiceCount: Number(sold?.invoiceCount || 0),
    };
  });

  // Rank on quantity, breaking ties on revenue so two products that shifted the
  // same number of units are ordered by what they actually brought in.
  const byQuantity = (a, b) => b.quantity - a.quantity || b.revenue - a.revenue;
  const top = [...ranked].sort(byQuantity).filter((p) => p.quantity > 0).slice(0, limit);
  const bottom = [...ranked].sort((a, b) => -byQuantity(a, b)).slice(0, limit);

  res.json({
    period,
    value,
    label,
    from,
    to,
    totals: {
      unitsSold: ranked.reduce((sum, p) => sum + p.quantity, 0),
      revenue: ranked.reduce((sum, p) => sum + p.revenue, 0),
      productsSold: ranked.filter((p) => p.quantity > 0).length,
      productsUnsold: ranked.filter((p) => p.quantity === 0).length,
    },
    top,
    bottom,
  });
});

export const dashboard = asyncHandler(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  // Cancelled invoices must not count towards sales, revenue or the chart.
  const live = { detstatus: false };
  const [totalCustomers, totalProducts, todaySales, monthlySales, revenue, recentInvoices, lowStockProducts, chartRows] = await Promise.all([
    Customer.count({ where: live }),
    Product.count({ where: live }),
    Invoice.sum('grandTotal', { where: { ...live, invoiceDate: today } }),
    Invoice.sum('grandTotal', { where: { ...live, invoiceDate: { [Op.gte]: monthStart } } }),
    Invoice.sum('grandTotal', { where: live }),
    Invoice.findAll({ where: live, include: Customer, order: [['addondt', 'DESC']], limit: 5 }),
    Product.findAll({ where: { ...live, stock: { [Op.lte]: col('low_stock_threshold') } }, limit: 10, order: [['stock', 'ASC']] }),
    Invoice.findAll({
      // The trend follows whatever period the dashboard is showing.
      where: withDateRange(live, req.query, 'invoiceDate'),
      attributes: ['invoiceDate', [fn('SUM', col('grand_total')), 'total']],
      group: ['invoiceDate'],
      order: [['invoiceDate', 'ASC']],
      // A year-long window needs more than 30 day-groups to draw a trend.
      limit: 400
    })
  ]);
  res.json({
    totalCustomers,
    totalProducts,
    todaySales: Number(todaySales || 0),
    monthlySales: Number(monthlySales || 0),
    revenue: Number(revenue || 0),
    recentInvoices,
    lowStockProducts,
    period: resolveNamedPeriod(req.query),
    charts: { sales: chartRows.map((row) => ({ date: row.invoiceDate, total: Number(row.get('total')) })) }
  });
});

/**
 * The operations summary: today against yesterday, what is pending and how
 * long it has been, and where each area stands.
 *
 * Scoped to the caller's locations by the service, so the figures agree with
 * the screens they link to — an overview that counts company-wide while the
 * list behind it counts one branch is an overview nobody trusts twice.
 */
export const operations = asyncHandler(async (req, res) => {
  res.json(await operationsSummary(req));
});
