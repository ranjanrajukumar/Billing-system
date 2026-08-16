import QRCode from 'qrcode';
import {
  BILL_OF_SUPPLY_STYLES, renderBillItems, renderChargeGrid, renderFooterGrid,
  renderLetterhead, renderPageFoot, renderPartyGrid, renderWordsRemark,
} from './billOfSupplyBlocks.js';

// Renders an invoice as a standalone HTML document from a template's
// drag-and-drop block layout. This is the single renderer: the designer's live
// preview and the real invoice output both come through here, so what you build
// is exactly what prints.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

/**
 * Blocks a user can drag onto the canvas. `options` describe the per-block
 * toggles the designer renders as checkboxes.
 */
export const BLOCK_TYPES = [
  { type: 'header', label: 'Company Header', description: 'Logo, company name, address and GST number', options: ['showLogo', 'showGst', 'showAddress'] },
  { type: 'title', label: 'Invoice Title', description: 'Large document heading', options: [] },
  { type: 'meta', label: 'Invoice Details', description: 'Invoice number and date', options: [] },
  { type: 'dispatch', label: 'Consignor / Consignee', description: 'Dispatched-from and delivered-to blocks side by side', options: [] },
  { type: 'declaration', label: 'Declaration', description: 'Certification line above the signatory', options: [] },
  { type: 'quoteHeader', label: 'Quotation Header', description: 'Premium header for quotations', options: ['showLogo', 'showAddress'] },
  { type: 'quoteParties', label: 'Quotation Parties', description: 'Premium customer details and quotation metadata', options: ['showGst', 'showAddress'] },
  // Bill-of-supply set: boxed grids matching pre-printed stationery.
  { type: 'bosLetterhead', label: 'Letterhead (boxed)', description: 'Firm name with PAN, GSTIN, licence, CIN and MSME lines', options: [] },
  { type: 'bosParties', label: 'Invoice & Billed To (boxed)', description: 'Document references beside the buyer, in a bordered grid', options: [] },
  { type: 'bosItems', label: 'Items Grid (with Packing/UM)', description: 'SR No, HSN, Packing, UM, Qty, Rate, Disc %, Amount', options: [] },
  { type: 'bosCharges', label: 'Charges & Value Grid', description: 'Discount and freight boxes beside the value column', options: [] },
  { type: 'bosWords', label: 'Amount in Words & Remark', description: 'Boxed words line with a remark row', options: [] },
  { type: 'bosFooter', label: 'Bank, Terms & Seal', description: 'Bank details and terms beside the certification and seal', options: [] },
  { type: 'bosPageFoot', label: 'Page Footer & Stamp', description: 'Page marker with the tax-free stamp', options: [] },
  { type: 'billTo', label: 'Bill To', description: 'Customer name, address and GST', options: ['showGst', 'showAddress'] },
  { type: 'items', label: 'Items Table', description: 'Product line items', options: ['showSerial', 'showHsn', 'showAmounts', 'showDiscount', 'showGst'] },
  { type: 'totals', label: 'Totals', description: 'Subtotal, tax breakdown and grand total', options: ['showTaxBreakup', 'showRoundOff'] },
  { type: 'amountWords', label: 'Amount in Words', description: 'Grand total spelled out', options: [] },
  { type: 'qrCode', label: 'QR Code', description: 'Scannable code with number and total', options: [] },
  { type: 'bank', label: 'Bank Details', description: 'Account details for payment', options: [] },
  { type: 'terms', label: 'Terms & Declaration', description: 'Terms and declaration text', options: [] },
  { type: 'signature', label: 'Signature', description: 'Authorised signatory block', options: [] },
  { type: 'footer', label: 'Footer Message', description: 'Closing message', options: [] },
  { type: 'text', label: 'Custom Text', description: 'Free text of your own', options: [] },
  { type: 'divider', label: 'Divider', description: 'Horizontal rule', options: [] },
  { type: 'spacer', label: 'Spacer', description: 'Vertical gap', options: [] },
];

/**
 * Sensible starting layout. Delivery challans move goods rather than money, so
 * they drop the pricing columns and the totals block.
 */
export function defaultLayout(kind = 'invoice') {
  const priced = kind !== 'deliveryChallan';
  return [
    { id: 'b1', type: 'header', showLogo: true, showGst: true, showAddress: true },
    { id: 'b2', type: 'title' },
    { id: 'b3', type: 'meta' },
    { id: 'b4', type: 'billTo', showGst: true, showAddress: true },
    { id: 'b5', type: 'items', showSerial: true, showHsn: true, showAmounts: priced, showDiscount: priced, showGst: priced },
    ...(priced ? [
      { id: 'b6', type: 'totals', showTaxBreakup: true, showRoundOff: true },
      { id: 'b7', type: 'amountWords' },
    ] : []),
    { id: 'b8', type: 'signature' },
    { id: 'b9', type: 'footer' },
  ];
}

const PAPER_WIDTHS = { A4: '210mm', A5: '148mm', '80mm': '80mm', '58mm': '58mm' };

function styles(template) {
  const width = PAPER_WIDTHS[template?.paperSize] || '210mm';
  const narrow = width === '80mm' || width === '58mm';
  return `
    @page { size: ${template?.paperSize === 'A5' ? 'A5' : 'auto'}; margin: ${narrow ? '4mm' : '12mm'}; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; font-size: ${narrow ? '10px' : '12px'}; }
    .sheet { width: ${width}; max-width: 100%; margin: 0 auto; padding: ${narrow ? '6px' : '18px'}; background: #fff; }
    .block { margin-bottom: 12px; }
    .row { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .company-name { font-size: ${narrow ? '13px' : '20px'}; font-weight: bold; }
    .muted { color: #555; }
    .title { text-align: center; font-size: ${narrow ? '14px' : '22px'}; font-weight: bold; letter-spacing: 1px; padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; }
    .label { font-weight: bold; text-transform: uppercase; font-size: 10px; color: #555; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #999; padding: ${narrow ? '3px' : '6px'}; text-align: left; }
    th { background: #eee; }
    thead { display: table-header-group; }
    tbody tr { page-break-inside: avoid; }
    .num { text-align: right; }
    .totals { width: ${narrow ? '100%' : '280px'}; margin-left: auto; }
    .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
    .totals .grand { border-top: 1px solid #000; margin-top: 4px; padding-top: 6px; font-weight: bold; font-size: ${narrow ? '11px' : '14px'}; }
    .logo { max-height: ${narrow ? '32px' : '56px'}; max-width: 160px; object-fit: contain; }
    .qr { width: ${narrow ? '60px' : '90px'}; height: auto; }
    ${BILL_OF_SUPPLY_STYLES}
    .sign { margin-top: 36px; text-align: right; }
    .sign-line { display: inline-block; border-top: 1px solid #000; padding-top: 4px; min-width: 170px; text-align: center; }
    .footer { text-align: center; font-style: italic; color: #444; }
    hr { border: 0; border-top: 1px solid #999; }
  `;
}

/** Template fields override the company record, so one template can print
 *  under a different trading name or registration set. */
const seller = (company, template) => ({
  name: template?.companyName || company?.name || 'Company Name',
  address: template?.address || company?.address,
  city: template?.city || company?.city,
  state: template?.state || company?.state,
  pincode: template?.pincode || company?.pincode,
  gstNumber: template?.gstNumber || company?.gstNumber,
  panNumber: template?.panNumber,
  phone: template?.phoneNumber || company?.mobile,
  email: template?.email || company?.email,
  website: template?.website,
});

function renderHeader(block, { company, template, mediaBase }) {
  const s = seller(company, template);
  const logo = block.showLogo && company?.logoUrl
    ? `<img class="logo" src="${esc(mediaBase + company.logoUrl)}" alt="">`
    : '';
  const address = block.showAddress
    ? `<div class="muted">${esc([s.address, s.city, s.state, s.pincode].filter(Boolean).join(', '))}</div>`
    : '';
  const contact = [
    s.phone && `Phone: ${s.phone}`,
    s.email && `Email: ${s.email}`,
    s.website,
  ].filter(Boolean).join(' · ');
  const registrations = [
    block.showGst && s.gstNumber && `GSTIN: ${s.gstNumber}`,
    s.panNumber && `PAN: ${s.panNumber}`,
  ].filter(Boolean).join('  ·  ');

  return `<div class="row">
    <div>
      <div class="company-name">${esc(s.name)}</div>
      ${address}
      ${contact ? `<div class="muted">${esc(contact)}</div>` : ''}
      ${registrations ? `<div class="muted">${esc(registrations)}</div>` : ''}
    </div>
    <div>${logo}</div>
  </div>`;
}

/** Two-column consignor and consignee, as on a bill of supply. */
function renderDispatch(_block, { invoice, company, template }) {
  const s = seller(company, template);
  const customer = invoice.Customer || {};
  const sellerLines = [
    esc([s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ')),
    s.gstNumber ? `GSTIN: ${esc(s.gstNumber)}` : '',
  ].filter(Boolean).join('<br>');
  const buyerLines = [
    esc([customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(', ')),
    customer.mobileNumber ? `Mobile: ${esc(customer.mobileNumber)}` : '',
    customer.gstNumber ? `GSTIN: ${esc(customer.gstNumber)}` : '',
  ].filter(Boolean).join('<br>');

  return `<table><thead><tr>
      <th style="width:50%">Consignor / Dispatched from</th>
      <th style="width:50%">Consignee / Delivery</th>
    </tr></thead><tbody><tr>
      <td><strong>${esc(s.name)}</strong><br>${sellerLines}</td>
      <td><strong>${esc(customer.customerName || '')}</strong><br>${buyerLines}</td>
    </tr></tbody></table>`;
}

function renderDeclaration(_block, { company, template }) {
  const s = seller(company, template);
  return `<div class="row" style="align-items:flex-end">
    <div class="muted" style="max-width:55%">
      ${esc(template?.declaration || 'Certified that the particulars given above are true and correct.')}
    </div>
    <div class="sign">
      <div>For <strong>${esc(s.name)}</strong></div>
      <div class="sign-line">${esc(template?.authorizedSignatory || 'Authorised Signatory')}</div>
    </div>
  </div>`;
}

function renderItems(block, { invoice }) {
  const items = invoice.InvoiceItems || [];
  // Documents that only move goods (delivery challans) carry no pricing.
  const withAmounts = block.showAmounts !== false;
  const columns = [
    block.showSerial && { header: '#', value: (_it, i) => i + 1, num: true },
    { header: 'Description', value: (it) => it.Product?.productName || '' },
    block.showHsn && { header: 'HSN', value: (it) => it.Product?.hsnCode || '' },
    { header: 'Qty', value: (it) => it.quantity, num: true },
    withAmounts && { header: 'Rate', value: (it) => money(it.rate), num: true },
    withAmounts && block.showDiscount && { header: 'Disc.', value: (it) => money(it.discount), num: true },
    withAmounts && block.showGst && { header: 'GST %', value: (it) => `${Number(it.gstPercent || 0)}%`, num: true },
    withAmounts && { header: 'Amount', value: (it) => money(it.amount), num: true },
  ].filter(Boolean);

  const head = columns.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.header)}</th>`).join('');
  const body = items.length
    ? items.map((item, i) => `<tr>${columns
        .map((c) => `<td${c.num ? ' class="num"' : ''}>${esc(c.value(item, i))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="muted">No items</td></tr>`;

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderTotals(block, { invoice }) {
  const lines = [`<div><span>Subtotal</span><span>${money(invoice.subtotal)}</span></div>`];
  if (block.showTaxBreakup) {
    if (Number(invoice.igst) > 0) {
      lines.push(`<div><span>IGST</span><span>${money(invoice.igst)}</span></div>`);
    } else {
      lines.push(`<div><span>CGST</span><span>${money(invoice.cgst)}</span></div>`);
      lines.push(`<div><span>SGST</span><span>${money(invoice.sgst)}</span></div>`);
    }
  }
  if (block.showRoundOff) lines.push(`<div><span>Round Off</span><span>${money(invoice.roundOff)}</span></div>`);
  lines.push(`<div class="grand"><span>Grand Total</span><span>${money(invoice.grandTotal)}</span></div>`);
  return `<div class="totals">${lines.join('')}</div>`;
}

const RENDERERS = {
  header: renderHeader,
  title: (_block, { invoice, template }) =>
    `<div class="title">${esc(template?.invoiceTitle || 'TAX INVOICE')}</div>`,
  meta: (_block, { invoice }) => `<div class="row">
      <div><div class="label">Invoice No.</div>${esc(invoice.invoiceNumber)}</div>
      <div><div class="label">Date</div>${esc(invoice.invoiceDate)}</div>
      ${invoice.dueDate ? `<div><div class="label">Due Date</div>${esc(invoice.dueDate)}</div>` : ''}
      ${invoice.paymentMethod ? `<div><div class="label">Payment</div>${esc(invoice.paymentMethod)}</div>` : ''}
    </div>`,
  billTo: (block, { invoice }) => {
    const customer = invoice.Customer || {};
    const address = block.showAddress
      ? `<div class="muted">${esc([customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(', '))}</div>`
      : '';
    const gst = block.showGst && customer.gstNumber ? `<div class="muted">GSTIN: ${esc(customer.gstNumber)}</div>` : '';
    return `<div><div class="label">Bill To</div>
      <div style="font-weight:bold">${esc(customer.customerName || '')}</div>${address}${gst}</div>`;
  },
  dispatch: renderDispatch,
  declaration: renderDeclaration,
  bosLetterhead: renderLetterhead,
  bosParties: renderPartyGrid,
  bosItems: renderBillItems,
  bosCharges: renderChargeGrid,
  bosWords: renderWordsRemark,
  bosFooter: renderFooterGrid,
  bosPageFoot: renderPageFoot,
  items: renderItems,
  totals: renderTotals,
  amountWords: (_block, { invoice }) =>
    `<div><span class="label">Amount in words</span> ${esc(invoice.amountInWords || '')}</div>`,
  qrCode: (_block, { qrDataUrl }) =>
    (qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="QR code">` : ''),
  bank: (_block, { template }) => {
    const rows = [
      ['Bank', template?.bankName], ['Account', template?.accountNumber],
      ['IFSC', template?.ifscCode], ['UPI', template?.upiId],
    ].filter(([, value]) => value);
    if (!rows.length) return '';
    return `<div><div class="label">Bank Details</div>${rows
      .map(([k, v]) => `<div>${esc(k)}: ${esc(v)}</div>`).join('')}</div>`;
  },
  terms: (_block, { template }) => {
    const parts = [template?.declaration, template?.footerMessage].filter(Boolean);
    if (!parts.length) return '';
    return `<div><div class="label">Terms &amp; Declaration</div>${parts
      .map((p) => `<div class="muted">${esc(p)}</div>`).join('')}</div>`;
  },
  signature: (_block, { template, company }) =>
    `<div class="sign"><div class="sign-line">${esc(template?.authorizedSignatory || `For ${company?.name || 'Company'}`)}</div></div>`,
  footer: (_block, { template }) =>
    (template?.footerMessage ? `<div class="footer">${esc(template.footerMessage)}</div>` : ''),
  text: (block) => `<div>${esc(block.text || '')}</div>`,
  divider: () => '<hr>',
  spacer: (block) => `<div style="height:${Number(block.height) || 16}px"></div>`,
  quoteHeader: (block, { company, template, mediaBase }) => {
    const s = seller(company, template);
    const logo = block.showLogo && company?.logoUrl
      ? `<img class="logo" style="max-height: 80px;" src="${esc(mediaBase + company.logoUrl)}" alt="">`
      : '';
    const address = block.showAddress
      ? `<div style="font-size: 14px; margin-top: 4px; color: #555;">${esc([s.address, s.city, s.state, s.pincode].filter(Boolean).join(', '))}</div>`
      : '';
    const contact = [
      s.phone && `Phone: ${s.phone}`,
      s.email && `Email: ${s.email}`,
      s.website,
    ].filter(Boolean).join(' · ');
    
    return `<div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #333; padding-bottom: 20px;">
      <div>
        <div style="font-size: 32px; font-weight: 900; color: #111; letter-spacing: -1px; text-transform: uppercase;">${esc(template?.invoiceTitle || 'QUOTATION')}</div>
        <div style="margin-top: 8px;">
          <div style="font-weight: bold; font-size: 18px;">${esc(s.name)}</div>
          ${address}
          ${contact ? `<div style="font-size: 12px; color: #777; margin-top: 4px;">${esc(contact)}</div>` : ''}
        </div>
      </div>
      <div style="text-align: right;">${logo}</div>
    </div>`;
  },
  quoteParties: (block, { invoice }) => {
    const customer = invoice.Customer || {};
    const address = block.showAddress
      ? `<div style="color: #444; line-height: 1.5; font-size: 13px; margin-top: 4px;">${esc([customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(', '))}</div>`
      : '';
    
    return `<div style="display: flex; justify-content: space-between; background-color: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;">
      <div style="width: 50%;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 4px; font-weight: bold;">Prepared For</div>
        <div style="font-weight: bold; font-size: 16px; color: #111;">${esc(customer.customerName || '')}</div>
        ${address}
        ${customer.mobileNumber ? `<div style="font-size: 13px; color: #444; margin-top: 4px;">M: ${esc(customer.mobileNumber)}</div>` : ''}
      </div>
      <div style="width: 40%; text-align: right;">
        <div style="margin-bottom: 8px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; font-weight: bold;">Quotation No.</div>
          <div style="font-size: 16px; font-weight: bold; color: #111;">${esc(invoice.quotationNumber || invoice.invoiceNumber)}</div>
        </div>
        <div>
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; font-weight: bold;">Date</div>
          <div style="font-size: 14px; color: #111;">${esc(invoice.quotationDate || invoice.invoiceDate)}</div>
        </div>
        ${invoice.validUntil ? `
        <div style="margin-top: 8px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; font-weight: bold;">Valid Until</div>
          <div style="font-size: 14px; color: #111;">${esc(invoice.validUntil)}</div>
        </div>` : ''}
      </div>
    </div>`;
  }
};

// The template form builds blocks as { id, key: 'companyHeader' }; the designer
// builds them as { id, type: 'header' }. Both write to designLayout, so accept
// either and normalise to one vocabulary.
const LEGACY_KEYS = {
  companyHeader: 'header',
  invoiceTitle: 'title',
  invoiceMeta: 'meta',
  customerBlock: 'billTo',
  itemsTable: 'items',
  taxSummary: 'totals',
  amountWords: 'amountWords',
  bankDetails: 'bank',
  signature: 'signature',
  footer: 'footer',
  qrCode: 'qrCode',
};

function normalizeBlock(block) {
  const type = block.type || LEGACY_KEYS[block.key] || block.key;
  const spec = BLOCK_TYPES.find((b) => b.type === type);
  const normalized = { ...block, type };
  // A block that never specified an option should show it, so layouts built
  // before the option existed keep rendering everything.
  for (const option of spec?.options || []) {
    if (normalized[option] === undefined) normalized[option] = true;
  }
  return normalized;
}

export async function renderInvoiceHtml({ invoice, company, template = {}, mediaBase = '' }) {
  const source = Array.isArray(template.designLayout) && template.designLayout.length
    ? template.designLayout
    : defaultLayout();
  const layout = source.map(normalizeBlock);

  const qrDataUrl = layout.some((block) => block.type === 'qrCode')
    ? await QRCode.toDataURL(`${invoice.invoiceNumber}|${invoice.grandTotal}`)
    : null;

  const context = { invoice, company, template, mediaBase, qrDataUrl };
  const body = layout.map((block) => {
    const renderer = RENDERERS[block.type];
    if (!renderer) return '';
    const html = renderer(block, context);
    return html ? `<div class="block">${html}</div>` : '';
  }).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(invoice.invoiceNumber || 'Invoice')}</title>
<style>${styles(template)}</style></head>
<body><div class="sheet">${body}</div></body></html>`;
}

// Specimen invoice so a layout can be previewed before any real data exists.
export function sampleInvoice() {
  return {
    invoiceNumber: 'INV-2026-00001',
    invoiceDate: new Date().toISOString().slice(0, 10),
    Customer: {
      customerName: 'Sample Customer Pvt Ltd',
      gstNumber: '33AAACA1234A1Z5',
      address: '12 Anna Salai', city: 'Chennai', state: 'Tamil Nadu', pincode: '600002',
    },
    InvoiceItems: [
      { Product: { productName: 'Sample Product A', hsnCode: '8471' }, quantity: 2, rate: 500, discount: 0, gstPercent: 18, amount: 1180 },
      { Product: { productName: 'Sample Service B', hsnCode: '9983' }, quantity: 1, rate: 1500, discount: 100, gstPercent: 18, amount: 1652 },
    ],
    subtotal: 2400, cgst: 216, sgst: 216, igst: 0, roundOff: 0, grandTotal: 2832,
    amountInWords: 'Two Thousand Eight Hundred Thirty Two Rupees Only',
  };
}
