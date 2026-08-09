import { Op } from 'sequelize';
import { Coupon, CouponUsage, Customer, Invoice } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { validateCoupon } from '../services/coupon.service.js';

export const listCoupons = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.search) {
    where[Op.or] = [
      { code: { [Op.like]: `%${req.query.search}%` } },
      { description: { [Op.like]: `%${req.query.search}%` } },
    ];
  }
  const { rows, count } = await Coupon.findAndCountAll({
    where, limit, offset, order: [['addondt', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const getCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
  res.json(coupon);
});

// Optional numbers and dates arrive as '' from a form; MySQL rejects that for
// DECIMAL/DATE columns, so blanks become null.
const OPTIONAL_FIELDS = ['maxDiscount', 'minOrderValue', 'usageLimit', 'perCustomerLimit', 'validFrom', 'validTo'];

function sanitizeCoupon(body) {
  const payload = { ...body };
  for (const field of OPTIONAL_FIELDS) {
    if (payload[field] === '' || payload[field] === undefined) delete payload[field];
    else if (payload[field] === null) payload[field] = null;
  }
  if (payload.minOrderValue === undefined) payload.minOrderValue = 0;
  return payload;
}

/** Codes must be unique among live coupons; deleted ones free their code. */
async function assertCodeFree(code, exceptId = null) {
  const where = { code, detstatus: false };
  if (exceptId) where.id = { [Op.ne]: exceptId };
  const clash = await Coupon.findOne({ where });
  if (clash) throw Object.assign(new Error(`Coupon code ${code} is already in use`), { status: 409 });
}

export const createCoupon = asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  await assertCodeFree(code);
  const coupon = await Coupon.create({ ...sanitizeCoupon(req.body), code, authadd: req.user?.id });
  res.status(201).json(coupon);
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

  const payload = { ...sanitizeCoupon(req.body), authlstedit: req.user?.id };
  if (payload.code) {
    payload.code = String(payload.code).trim().toUpperCase();
    await assertCodeFree(payload.code, coupon.id);
  }
  // usedCount is a running total, never something the client sets.
  delete payload.usedCount;
  await coupon.update(payload);
  res.json(coupon);
});

export const removeCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
  await coupon.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  res.status(204).send();
});

/** Previews what a code is worth before the invoice is saved. */
export const checkCoupon = asyncHandler(async (req, res) => {
  const { coupon, discount } = await validateCoupon({
    code: req.body.code,
    customerId: req.body.customerId,
    orderValue: req.body.orderValue,
  });
  res.json({
    valid: true,
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: Number(coupon.discountValue),
    discount,
  });
});

/** Where a coupon has been used. */
export const couponUsage = asyncHandler(async (req, res) => {
  const usages = await CouponUsage.findAll({
    where: { couponId: req.params.id, detstatus: false },
    include: [
      { model: Customer, attributes: ['id', 'customerName'] },
    ],
    order: [['addondt', 'DESC']],
    limit: 100,
  });
  const invoiceIds = usages.map((u) => u.invoiceId).filter(Boolean);
  const invoices = invoiceIds.length
    ? await Invoice.findAll({ where: { id: invoiceIds }, attributes: ['id', 'invoiceNumber'], raw: true })
    : [];
  const numberById = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));

  res.json(usages.map((u) => ({
    id: u.id,
    customerName: u.Customer?.customerName || '—',
    invoiceNumber: numberById.get(u.invoiceId) || '—',
    discountAmount: Number(u.discountAmount),
    usedAt: u.addondt,
  })));
});
