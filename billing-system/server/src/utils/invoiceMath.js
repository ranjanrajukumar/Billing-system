const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underHundred(n) {
  if (n < 20) return ones[n];
  return `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim();
}

function underThousand(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h ? `${ones[h]} Hundred ` : ''}${r ? underHundred(r) : ''}`.trim();
}

export function amountInWords(amount) {
  let n = Math.round(Number(amount || 0));
  if (n === 0) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (n) parts.push(underThousand(n));
  return `${parts.join(' ')} Rupees Only`;
}

/**
 * @param items         line items with quantity, rate, discount, gstPercent
 * @param customerState used to decide CGST/SGST versus IGST
 * @param companyState  the seller's state
 * @param options       { couponDiscount, pointsDiscount, charges } — invoice-level
 *                      adjustments applied BEFORE GST, spread across the lines
 *                      in proportion to each line's taxable value so that lines
 *                      on different GST rates each carry their fair share.
 *
 *                      `charges` are the boxes printed on a bill of supply:
 *                      quantityDiscount, cashDiscount, specialDiscount and
 *                      freightDeducted come off the taxable value; packingCharge,
 *                      freightCharge and otherCharges are added to it; cess is
 *                      levied after GST and so is added straight to the total.
 */
export function calculateInvoice(items, customerState, companyState, options = {}) {
  const charge = (name) => Math.max(Number(options.charges?.[name] || 0), 0);
  const deduction = charge('quantityDiscount') + charge('cashDiscount')
    + charge('specialDiscount') + charge('freightDeducted');
  const addition = charge('packingCharge') + charge('freightCharge') + charge('otherCharges');
  const cess = charge('cess');

  const lines = items.map((item) => {
    const qty = Number(item.quantity);
    const rate = Number(item.rate);
    const discount = Number(item.discount || 0);
    const gstPercent = Number(item.gstPercent || 0);
    return { item, qty, rate, discount, gstPercent, taxable: Math.max(qty * rate - discount, 0) };
  });

  const grossTaxable = lines.reduce((sum, line) => sum + line.taxable, 0);
  const requested = Number(options.couponDiscount || 0) + Number(options.pointsDiscount || 0);
  // Never discount below zero, whatever was asked for.
  const invoiceDiscount = Math.min(Math.max(requested, 0), grossTaxable);
  const reduction = Math.min(Math.max(requested, 0) + deduction, grossTaxable);
  // A positive adjustment lowers the taxable value, a negative one raises it.
  const adjustment = reduction - addition;

  let subtotal = 0;
  let taxTotal = 0;
  const normalized = lines.map(({ item, qty, rate, discount, gstPercent, taxable }) => {
    const share = grossTaxable > 0 ? (taxable / grossTaxable) * adjustment : 0;
    const netTaxable = Math.max(taxable - share, 0);
    const gstAmount = netTaxable * (gstPercent / 100);
    subtotal += netTaxable;
    taxTotal += gstAmount;
    return {
      ...item,
      quantity: qty,
      rate,
      discount,
      gstPercent,
      gstAmount,
      // What this line contributed to the invoice-level discount.
      allocatedDiscount: share,
      amount: netTaxable + gstAmount
    };
  });

  const sameState = String(customerState || '').toLowerCase() === String(companyState || '').toLowerCase();
  const cgst = sameState ? taxTotal / 2 : 0;
  const sgst = sameState ? taxTotal / 2 : 0;
  const igst = sameState ? 0 : taxTotal;
  // Cess sits outside the GST calculation, so it lands on the total directly.
  const totalBeforeRound = subtotal + taxTotal + cess;
  const grandTotal = Math.round(totalBeforeRound);
  return {
    items: normalized,
    subtotal,
    cgst,
    sgst,
    igst,
    grandTotal,
    grossTaxable,
    invoiceDiscount,
    addition,
    deduction,
    cess,
    roundOff: grandTotal - totalBeforeRound,
    amountInWords: amountInWords(grandTotal)
  };
}
