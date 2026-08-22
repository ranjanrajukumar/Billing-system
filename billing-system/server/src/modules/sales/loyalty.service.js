import { Customer, LoyaltyTransaction } from '../../models/index.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

export function loyaltyConfig(company) {
  return {
    enabled: Boolean(company?.loyaltyEnabled),
    pointsPer100: Number(company?.loyaltyPointsPer100 ?? 1),
    redeemValue: Number(company?.loyaltyRedeemValue ?? 1),
    minRedeem: Number(company?.loyaltyMinRedeem ?? 100),
  };
}

/** Points earned on a bill, rounded down so we never over-award. */
export function pointsForAmount(amount, config) {
  if (!config.enabled || config.pointsPer100 <= 0) return 0;
  return Math.floor((Number(amount || 0) / 100) * config.pointsPer100);
}

/** Rupee value of a number of points. */
export const pointsToAmount = (points, config) => round2(Number(points || 0) * config.redeemValue);

/**
 * Checks a redemption request against the customer's balance and the rules.
 * Returns the money value the points are worth.
 */
export async function validateRedemption({ customer, points, orderValue, config }) {
  const wanted = Math.floor(Number(points || 0));
  if (wanted <= 0) return { points: 0, amount: 0 };

  if (!config.enabled) {
    throw Object.assign(new Error('Loyalty points are not enabled'), { status: 400 });
  }
  if (wanted > Number(customer.loyaltyPoints || 0)) {
    throw Object.assign(
      new Error(`Customer only has ${customer.loyaltyPoints || 0} points`),
      { status: 400 },
    );
  }
  if (wanted < config.minRedeem) {
    throw Object.assign(
      new Error(`At least ${config.minRedeem} points are needed to redeem`),
      { status: 400 },
    );
  }

  const amount = pointsToAmount(wanted, config);
  if (amount > round2(orderValue)) {
    throw Object.assign(new Error('Points redeemed exceed the bill value'), { status: 400 });
  }
  return { points: wanted, amount };
}

/** Applies a points change and writes the ledger row. */
export async function movePoints({ customerId, points, entryType, invoiceId, notes, userId, transaction }) {
  if (!points) return null;

  const customer = await Customer.findByPk(customerId, {
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });

  const balanceAfter = Math.max(Number(customer.loyaltyPoints || 0) + Number(points), 0);
  await customer.update({ loyaltyPoints: balanceAfter }, { transaction });

  return LoyaltyTransaction.create({
    customerId,
    invoiceId,
    entryType,
    points,
    balanceAfter,
    notes,
    authadd: userId,
  }, { transaction });
}

/**
 * Reverses everything a cancelled invoice did to the customer's points:
 * awarded points are taken back, redeemed points are returned.
 */
export async function reverseInvoicePoints({ invoiceId, userId, transaction }) {
  const entries = await LoyaltyTransaction.findAll({
    where: { invoiceId, detstatus: false },
    transaction,
  });

  for (const entry of entries) {
    if (entry.entryType === 'Reversed') continue;
    await movePoints({
      customerId: entry.customerId,
      points: -Number(entry.points),
      entryType: 'Reversed',
      invoiceId,
      notes: `Reversed ${entry.entryType.toLowerCase()} points from cancelled invoice`,
      userId,
      transaction,
    });
    await entry.update({ detstatus: true, authdel: userId, delondt: new Date() }, { transaction });
  }
}
