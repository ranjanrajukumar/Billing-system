import { Coupon, CouponUsage } from '../models/index.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Checks a coupon against an order and works out what it is worth.
 * Returns { coupon, discount }; throws with a status for anything invalid.
 */
export async function validateCoupon({ code, customerId, orderValue, transaction }) {
  const coupon = await Coupon.findOne({
    // Codes are stored upper-cased, so match that rather than leaning on the
    // column's collation being case-insensitive.
    where: { code: String(code || '').trim().toUpperCase(), detstatus: false },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!coupon) throw Object.assign(new Error('Coupon code not found'), { status: 404 });
  if (!coupon.isActive) throw Object.assign(new Error('This coupon is no longer active'), { status: 400 });

  const now = today();
  if (coupon.validFrom && now < coupon.validFrom) {
    throw Object.assign(new Error(`This coupon is valid from ${coupon.validFrom}`), { status: 400 });
  }
  if (coupon.validTo && now > coupon.validTo) {
    throw Object.assign(new Error(`This coupon expired on ${coupon.validTo}`), { status: 400 });
  }

  const value = round2(orderValue);
  if (value < Number(coupon.minOrderValue)) {
    throw Object.assign(
      new Error(`This coupon needs a minimum order of ${Number(coupon.minOrderValue).toFixed(2)}`),
      { status: 400 },
    );
  }

  if (coupon.usageLimit != null && Number(coupon.usedCount) >= Number(coupon.usageLimit)) {
    throw Object.assign(new Error('This coupon has reached its usage limit'), { status: 400 });
  }

  if (coupon.perCustomerLimit != null && customerId) {
    const used = await CouponUsage.count({
      where: { couponId: coupon.id, customerId, detstatus: false },
      transaction,
    });
    if (used >= Number(coupon.perCustomerLimit)) {
      throw Object.assign(new Error('This customer has already used this coupon'), { status: 400 });
    }
  }

  let discount = coupon.discountType === 'Percentage'
    ? value * (Number(coupon.discountValue) / 100)
    : Number(coupon.discountValue);

  if (coupon.maxDiscount != null) discount = Math.min(discount, Number(coupon.maxDiscount));
  // A coupon can never be worth more than the order itself.
  discount = round2(Math.min(discount, value));

  return { coupon, discount };
}

/** Records that a coupon was used, so limits stay accurate. */
export async function recordCouponUse({ coupon, customerId, invoiceId, discount, userId, transaction }) {
  await CouponUsage.create({
    couponId: coupon.id,
    customerId,
    invoiceId,
    discountAmount: round2(discount),
    authadd: userId,
  }, { transaction });
  await coupon.increment('usedCount', { by: 1, transaction });
}

/** Undoes a coupon use when the invoice it belonged to is cancelled. */
export async function releaseCouponUse({ invoiceId, userId, transaction }) {
  const usages = await CouponUsage.findAll({
    where: { invoiceId, detstatus: false },
    transaction,
  });
  for (const usage of usages) {
    await usage.update({ detstatus: true, authdel: userId, delondt: new Date() }, { transaction });
    const coupon = await Coupon.findByPk(usage.couponId, { transaction });
    if (coupon && Number(coupon.usedCount) > 0) {
      await coupon.decrement('usedCount', { by: 1, transaction });
    }
  }
}
