/**
 * Five ready-made invoice layouts, seeded once so a new install has something
 * usable. The first mirrors the Dharti Agro "Bill of Supply" reference: rich
 * header, consignor/consignee blocks, HSN column, declaration and signatory.
 *
 * Whichever template is set as default is what every invoice prints as.
 */

const block = (id, type, options = {}) => ({ id, type, ...options });

export const DEFAULT_TEMPLATES = [
  {
    // A close reproduction of a pre-printed bill of supply: boxed grids,
    // packing/UM columns, charge boxes and the certification block.
    templateName: 'Bill of Supply — Exact',
    invoiceTitle: 'BILL OF SUPPLY',
    paperSize: 'A4',
    declaration: [
      'Subject to Nagpur Jurisdiction only.',
      'Our responsibility ceases after goods are handed over to carrier.',
      'Goods once delivered cannot be taken back or exchanged.',
      'Interest will be charged at 18% p.a. after 7 days from the date of bill.',
      'We make no other express or implied warranty of merchantability, fitness, particular purpose or otherwise.',
      'Our liability in all instances is limited to the purchase price of seed and shall not include any consequential damages.',
    ].join('\n'),
    footerMessage: 'ALL TYPE OF SEEDS TAX FREE — SEEDS USED FOR SOWING ONLY AND NOT MEANT FOR ANY OTHER USE',
    authorizedSignatory: 'Authorised Signatory',
    designLayout: [
      block('t0-1', 'bosLetterhead'),
      block('t0-2', 'title'),
      block('t0-3', 'bosParties'),
      block('t0-4', 'dispatch'),
      block('t0-5', 'bosItems'),
      block('t0-6', 'bosCharges'),
      block('t0-7', 'bosWords'),
      block('t0-8', 'bosFooter'),
      block('t0-9', 'bosPageFoot'),
    ],
  },
  {
    templateName: 'Bill of Supply (Tax Free)',
    invoiceTitle: 'BILL OF SUPPLY',
    paperSize: 'A4',
    declaration: 'Certified that the particulars given above are true and correct. '
      + 'Goods are exempt from GST. Seeds sold for sowing only and not meant for any other use.',
    footerMessage: 'All types of seeds are tax free.',
    authorizedSignatory: 'Authorised Signatory',
    designLayout: [
      block('t1-1', 'header', { showLogo: true, showGst: true, showAddress: true }),
      block('t1-2', 'title'),
      block('t1-3', 'meta'),
      block('t1-4', 'dispatch'),
      block('t1-5', 'items', { showSerial: true, showHsn: true, showAmounts: true, showDiscount: true, showGst: false }),
      block('t1-6', 'totals', { showTaxBreakup: false, showRoundOff: true }),
      block('t1-7', 'amountWords'),
      block('t1-8', 'terms'),
      block('t1-9', 'declaration'),
      block('t1-10', 'footer'),
    ],
  },
  {
    templateName: 'Tax Invoice (GST)',
    invoiceTitle: 'TAX INVOICE',
    paperSize: 'A4',
    declaration: 'Certified that the particulars given above are true and correct.',
    authorizedSignatory: 'Authorised Signatory',
    designLayout: [
      block('t2-1', 'header', { showLogo: true, showGst: true, showAddress: true }),
      block('t2-2', 'title'),
      block('t2-3', 'meta'),
      block('t2-4', 'billTo', { showGst: true, showAddress: true }),
      block('t2-5', 'items', { showSerial: true, showHsn: true, showAmounts: true, showDiscount: true, showGst: true }),
      block('t2-6', 'totals', { showTaxBreakup: true, showRoundOff: true }),
      block('t2-7', 'amountWords'),
      block('t2-8', 'bank'),
      block('t2-9', 'declaration'),
    ],
  },
  {
    templateName: 'Delivery / Dispatch Note',
    invoiceTitle: 'DELIVERY NOTE',
    paperSize: 'A4',
    declaration: 'Received the goods listed above in good condition.',
    authorizedSignatory: 'Receiver Signature',
    designLayout: [
      block('t3-1', 'header', { showLogo: true, showGst: true, showAddress: true }),
      block('t3-2', 'title'),
      block('t3-3', 'meta'),
      block('t3-4', 'dispatch'),
      // Quantities only: a dispatch note moves goods, not money.
      block('t3-5', 'items', { showSerial: true, showHsn: true, showAmounts: false }),
      block('t3-6', 'declaration'),
    ],
  },
  {
    templateName: 'Simple Cash Bill',
    invoiceTitle: 'CASH BILL',
    paperSize: 'A5',
    footerMessage: 'Thank you for your business.',
    designLayout: [
      block('t4-1', 'header', { showLogo: false, showGst: true, showAddress: true }),
      block('t4-2', 'title'),
      block('t4-3', 'meta'),
      block('t4-4', 'billTo', { showGst: false, showAddress: false }),
      block('t4-5', 'items', { showSerial: true, showHsn: false, showAmounts: true, showDiscount: false, showGst: false }),
      block('t4-6', 'totals', { showTaxBreakup: true, showRoundOff: true }),
      block('t4-7', 'amountWords'),
      block('t4-8', 'footer'),
    ],
  },
  {
    templateName: 'Thermal Receipt (80mm)',
    invoiceTitle: 'RECEIPT',
    paperSize: '80mm',
    footerMessage: 'Thank you — visit again!',
    designLayout: [
      block('t5-1', 'header', { showLogo: false, showGst: true, showAddress: false }),
      block('t5-2', 'title'),
      block('t5-3', 'meta'),
      block('t5-4', 'items', { showSerial: false, showHsn: false, showAmounts: true, showDiscount: false, showGst: false }),
      block('t5-5', 'totals', { showTaxBreakup: true, showRoundOff: true }),
      block('t5-6', 'qrCode'),
      block('t5-7', 'footer'),
    ],
  },
];
