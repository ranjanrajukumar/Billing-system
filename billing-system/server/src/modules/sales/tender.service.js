/**
 * How a sale was paid for.
 *
 * A counter sale is rarely one clean payment. Three hundred in cash and the
 * rest on a card is ordinary, and so is paying half now and putting the balance
 * on the customer's account. The old shape could express neither: one
 * `paymentMethod` on the invoice, and one payment for the whole amount.
 *
 * Two ideas make the rest of this simple.
 *
 * **Credit is not a tender.** It is what is left when the tenders run out. The
 * old code treated `paymentMethod: 'Credit'` as a special path that skipped
 * creating a payment; here, a credit sale is just a sale with nothing tendered,
 * and a part-paid sale is the same thing with a smaller gap. One rule covers
 * what used to be two.
 *
 * **Change is not a payment.** A customer handing over ₹500 for a ₹327 bill has
 * paid ₹327; the ₹173 goes straight back across the counter and never belonged
 * to the business. Recording the tendered figure would overstate both the day's
 * takings and the drawer. The counter needs the number to *count out* the
 * change, which is why it is computed and shown — and never stored.
 */

/** Rounds to paise, so repeated arithmetic cannot leave a bill a cent out. */
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** The methods a payment can actually arrive by. Credit is deliberately absent. */
export const TENDER_METHODS = ['Cash', 'Card', 'UPI', 'Bank Transfer'];

/**
 * Turns whatever the caller sent into the list of payments to record.
 *
 * Accepts both shapes on purpose. The old one — a single `paymentMethod`
 * meaning "paid in full by this" — is what every existing screen and any
 * integration still sends, and it keeps working untouched.
 */
export function normaliseTender({ payments, paymentMethod }, grandTotal) {
  const total = money(grandTotal);

  const lines = Array.isArray(payments) && payments.length
    ? payments
      .map((line) => ({
        paymentMethod: line.paymentMethod,
        amount: money(line.amount),
        referenceNumber: line.referenceNumber || null,
      }))
      // A blank row on a split-payment panel is a row the cashier did not use.
      .filter((line) => line.amount > 0)
    // The old shape: one method, paid in full — unless it was Credit, which
    // now simply means nothing was tendered.
    : paymentMethod && paymentMethod !== 'Credit'
      ? [{ paymentMethod, amount: total, referenceNumber: null }]
      : [];

  for (const line of lines) {
    if (!TENDER_METHODS.includes(line.paymentMethod)) {
      throw Object.assign(
        new Error(`"${line.paymentMethod}" is not a way of paying. Credit is the unpaid balance, not a tender.`),
        { status: 400 },
      );
    }
    if (!(line.amount > 0)) {
      throw Object.assign(new Error('A payment must be greater than zero'), { status: 400 });
    }
  }

  const paid = money(lines.reduce((sum, line) => sum + line.amount, 0));

  // Tendering more than the bill is how change happens, and change is not
  // revenue. Refused rather than silently trimmed, because the difference
  // between "they overpaid" and "somebody typed an extra nought" is one the
  // person at the counter can see and this function cannot.
  if (paid > total + 0.009) {
    throw Object.assign(
      new Error(
        `Payments total ${paid.toFixed(2)}, which is more than the bill of ${total.toFixed(2)}. `
        + 'Enter what is being kept, not what was handed over — the change is worked out for you.',
      ),
      { status: 400 },
    );
  }

  return {
    lines,
    paid,
    /** What is going on the customer's account. Zero on a fully paid sale. */
    onCredit: money(total - paid),
    /**
     * The one method to stamp on the invoice header.
     *
     * The payment rows are the authority on how a bill was settled — this is a
     * summary, and it is the largest component rather than the first so that a
     * mostly-cash sale reads as a cash sale. `Credit` when nothing was tendered,
     * which keeps the existing column and its enum exactly as they were.
     */
    method: lines.length
      ? lines.reduce((biggest, line) => (line.amount > biggest.amount ? line : biggest)).paymentMethod
      : 'Credit',
  };
}

/**
 * What to hand back.
 *
 * Never stored and never sent to the server — the counter works it out from
 * what it already knows, and the answer is only useful for the two seconds
 * somebody is counting coins out of a drawer.
 */
export const changeDue = (tendered, paid) => Math.max(0, money(tendered) - money(paid));
