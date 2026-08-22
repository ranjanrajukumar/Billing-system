import { amountInWords } from '../../utils/invoiceMath.js';

// Every document stores its own column names, but the PDF and HTML renderers
// both speak "invoice". This maps each one onto that shape so there is a single
// rendering path rather than one per document type.

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const SHAPES = {
  quotation: {
    title: 'QUOTATION',
    number: 'quotationNumber',
    date: 'quotationDate',
    items: 'QuotationItems',
    total: 'totalAmount',
  },
  salesOrder: {
    title: 'SALES ORDER',
    number: 'orderNumber',
    date: 'orderDate',
    items: 'SalesOrderItems',
    total: 'totalAmount',
  },
  deliveryChallan: {
    title: 'DELIVERY CHALLAN',
    number: 'challanNumber',
    date: 'challanDate',
    items: 'DeliveryChallanItems',
    total: null, // a challan moves goods, not money
  },
  salesReturn: {
    title: 'CREDIT NOTE',
    number: 'returnNumber',
    date: 'returnDate',
    items: 'SalesReturnItems',
    total: 'totalRefund',
  },
};

export const documentTitle = (kind) => SHAPES[kind]?.title || 'DOCUMENT';

// A challan has no pricing, so its items carry quantity only.
const carriesAmounts = (kind) => kind !== 'deliveryChallan';

function lineFor(kind, item) {
  const quantity = Number(item.quantity || 0);

  if (kind === 'salesReturn') {
    const amount = Number(item.refundAmount || 0);
    return { quantity, rate: quantity ? amount / quantity : 0, discount: 0, gstPercent: 0, gstAmount: 0, amount };
  }
  if (kind === 'deliveryChallan') {
    return { quantity, rate: 0, discount: 0, gstPercent: 0, gstAmount: 0, amount: 0 };
  }

  const rate = Number(item.unitPrice ?? item.rate ?? 0);
  const discount = Number(item.discount || 0);
  const gstPercent = Number(item.gstPercent || 0);
  const taxable = Math.max(quantity * rate - discount, 0);
  const gstAmount = taxable * (gstPercent / 100);
  return { quantity, rate, discount, gstPercent, gstAmount, amount: item.totalPrice ?? taxable + gstAmount };
}

/**
 * Converts a document record into the invoice-like object the renderers expect.
 */
export function toPrintableDocument(kind, record, companyState) {
  const shape = SHAPES[kind];
  if (!shape) throw Object.assign(new Error(`Unknown document type: ${kind}`), { status: 400 });

  const source = record[shape.items] || [];
  const items = source.map((item) => ({ Product: item.Product, ...lineFor(kind, item) }));

  const subtotal = round2(items.reduce((sum, item) => sum + (item.amount - item.gstAmount), 0));
  const taxTotal = round2(items.reduce((sum, item) => sum + item.gstAmount, 0));
  const grandTotal = shape.total != null
    ? round2(record[shape.total])
    : round2(subtotal + taxTotal);

  const sameState = String(record.Customer?.state || '').toLowerCase()
    === String(companyState || '').toLowerCase();

  return {
    invoiceNumber: record[shape.number],
    invoiceDate: record[shape.date],
    Customer: record.Customer,
    InvoiceItems: items,
    subtotal,
    cgst: sameState ? round2(taxTotal / 2) : 0,
    sgst: sameState ? round2(taxTotal / 2) : 0,
    igst: sameState ? 0 : taxTotal,
    roundOff: round2(grandTotal - subtotal - taxTotal),
    grandTotal,
    amountInWords: shape.total != null ? amountInWords(grandTotal) : '',
    notes: record.notes,
  };
}
