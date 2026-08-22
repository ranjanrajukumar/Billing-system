import { Company, Customer, LoyaltyTransaction, sequelize } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { loyaltyConfig, movePoints, pointsToAmount } from './loyalty.service.js';
import { getPagination, paged } from '../../utils/pagination.js';

/** Current scheme settings, so the invoice form knows the rules. */
export const loyaltySettings = asyncHandler(async (_req, res) => {
  const config = loyaltyConfig(await Company.findOne());
  res.json(config);
});

/** Customers holding points, richest first. */
export const loyaltyMembers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await Customer.findAndCountAll({
    where: { detstatus: false },
    attributes: ['id', 'customerName', 'mobileNumber', 'loyaltyPoints'],
    order: [['loyaltyPoints', 'DESC'], ['customerName', 'ASC']],
    limit, offset,
  });
  const config = loyaltyConfig(await Company.findOne());
  res.json(paged(
    rows.map((c) => ({ ...c.toJSON(), pointsValue: pointsToAmount(c.loyaltyPoints, config) })),
    count, page, limit,
  ));
});

/** One customer's balance and point history. */
export const customerPoints = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({
    where: { id: req.params.customerId, detstatus: false },
    attributes: ['id', 'customerName', 'mobileNumber', 'loyaltyPoints'],
  });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });

  const config = loyaltyConfig(await Company.findOne());
  const history = await LoyaltyTransaction.findAll({
    where: { customerId: customer.id, detstatus: false },
    order: [['addondt', 'DESC'], ['id', 'DESC']],
    limit: 100,
  });

  res.json({
    customer,
    balance: Number(customer.loyaltyPoints || 0),
    value: pointsToAmount(customer.loyaltyPoints, config),
    config,
    history,
  });
});

/** Manual correction, e.g. a goodwill award or fixing a mistake. */
export const adjustPoints = asyncHandler(async (req, res) => {
  const points = Math.trunc(Number(req.body.points));
  if (!points) return res.status(400).json({ message: 'Points must be a non-zero whole number' });

  const entry = await sequelize.transaction((transaction) => movePoints({
    customerId: req.body.customerId,
    points,
    entryType: 'Adjusted',
    notes: req.body.notes || 'Manual adjustment',
    userId: req.user?.id,
    transaction,
  }));

  res.status(201).json(entry);
});
