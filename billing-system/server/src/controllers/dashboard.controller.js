import { Op, fn, col, literal } from 'sequelize';
import { Customer, Invoice, Product, InvoiceItem } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const dashboard = asyncHandler(async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [totalCustomers, totalProducts, todaySales, monthlySales, revenue, recentInvoices, lowStockProducts, chartRows] = await Promise.all([
    Customer.count(),
    Product.count(),
    Invoice.sum('grandTotal', { where: { invoiceDate: today } }),
    Invoice.sum('grandTotal', { where: { invoiceDate: { [Op.gte]: monthStart } } }),
    Invoice.sum('grandTotal'),
    Invoice.findAll({ include: Customer, order: [['addondt', 'DESC']], limit: 5 }),
    Product.findAll({ where: { stock: { [Op.lte]: col('low_stock_threshold') } }, limit: 10, order: [['stock', 'ASC']] }),
    Invoice.findAll({
      attributes: ['invoiceDate', [fn('SUM', col('grand_total')), 'total']],
      group: ['invoiceDate'],
      order: [['invoiceDate', 'ASC']],
      limit: 30
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
    charts: { sales: chartRows.map((row) => ({ date: row.invoiceDate, total: Number(row.get('total')) })) }
  });
});
