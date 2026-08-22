import { Subscription, Customer, Product } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';

export const listSubscriptions = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await Subscription.findAndCountAll({
    where: { detstatus: false },
    include: [{ model: Customer }, { model: Product }],
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });
  res.json(paged(rows, count, page, limit));
});

export const getSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({
    where: { id: req.params.id, detstatus: false },
    include: [{ model: Customer }, { model: Product }]
  });
  if (!subscription) return res.status(404).json({ message: 'Subscription not found' });
  res.json(subscription);
});

export const createSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.create({
    ...req.body,
    authadd: req.user.id
  });
  const created = await Subscription.findOne({
    where: { id: subscription.id },
    include: [{ model: Customer }, { model: Product }]
  });
  res.status(201).json(created);
});

export const updateSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!subscription) return res.status(404).json({ message: 'Subscription not found' });
  
  await subscription.update({
    ...req.body,
    authlstedit: req.user.id
  });

  const updated = await Subscription.findOne({
    where: { id: subscription.id },
    include: [{ model: Customer }, { model: Product }]
  });
  res.json(updated);
});

export const removeSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!subscription) return res.status(404).json({ message: 'Subscription not found' });
  
  await subscription.update({
    status: 'Cancelled',
    detstatus: true,
    authdel: req.user.id,
    delondt: new Date()
  });
  res.json({ message: 'Subscription cancelled successfully' });
});
