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

export function calculateInvoice(items, customerState, companyState) {
  let subtotal = 0;
  let taxTotal = 0;
  const normalized = items.map((item) => {
    const qty = Number(item.quantity);
    const rate = Number(item.rate);
    const discount = Number(item.discount || 0);
    const gstPercent = Number(item.gstPercent || 0);
    const taxable = Math.max(qty * rate - discount, 0);
    const gstAmount = taxable * (gstPercent / 100);
    subtotal += taxable;
    taxTotal += gstAmount;
    return { ...item, quantity: qty, rate, discount, gstPercent, gstAmount, amount: taxable + gstAmount };
  });
  const sameState = String(customerState || '').toLowerCase() === String(companyState || '').toLowerCase();
  const cgst = sameState ? taxTotal / 2 : 0;
  const sgst = sameState ? taxTotal / 2 : 0;
  const igst = sameState ? 0 : taxTotal;
  const totalBeforeRound = subtotal + taxTotal;
  const grandTotal = Math.round(totalBeforeRound);
  return {
    items: normalized,
    subtotal,
    cgst,
    sgst,
    igst,
    grandTotal,
    roundOff: grandTotal - totalBeforeRound,
    amountInWords: amountInWords(grandTotal)
  };
}
