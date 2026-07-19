import { Customer, Invoice, Payment } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

export const listPayments = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await Payment.findAndCountAll({
    include: [{ model: Invoice, include: Customer }],
    limit,
    offset,
    order: [['paidAt', 'DESC'], ['id', 'DESC']]
  });
  res.json(paged(rows, count, page, limit));
});

export const createPayment = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.body.invoiceId}, include: Payment });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

  const payment = await Payment.create({ ...req.body, authadd: req.user?.id });
  const paid = Number(invoice.Payments?.reduce((sum, item) => sum + Number(item.amount), 0) || 0) + Number(payment.amount);
  await invoice.update({ status: paid >= Number(invoice.grandTotal) ? 'Paid' : 'Partially Paid' });
  res.status(201).json(payment);
});
