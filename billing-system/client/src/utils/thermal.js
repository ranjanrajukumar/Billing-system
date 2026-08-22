/**
 * thermal.js — Client-side thermal receipt HTML renderer.
 *
 * Generates a complete HTML document that, when printed via the browser,
 * produces a receipt sized for the configured paper width.
 *
 * Works with any thermal printer installed as a Windows printer because it
 * relies on the browser's print engine rather than raw ESC/POS commands.
 * The caller only needs to do:  printHtml(buildThermalHtml(invoice, company, opts))
 */

import { formatProductTitle } from './productFormatters.js';

// ─── Paper size profiles ────────────────────────────────────────────────────
// widthMm  : physical paper width
// printMm  : printable area width (paper minus left+right margin)
// itemCh   : character width of the product-name column
// qtyCh    : character width of the quantity column
// rateCh   : character width of the rate column
// amtCh    : character width of the amount column
// fontSize : base font size in pt
const PROFILES = {
  '58mm':   { widthMm: 58,  printMm: 48,  itemCh: 16, qtyCh: 4,  rateCh: 6,  amtCh: 7,  fontSize: 7.5 },
  '80mm':   { widthMm: 80,  printMm: 72,  itemCh: 22, qtyCh: 5,  rateCh: 8,  amtCh: 9,  fontSize: 8.5 },
  '110mm':  { widthMm: 110, printMm: 100, itemCh: 32, qtyCh: 6,  rateCh: 10, amtCh: 12, fontSize: 9   },
  '112mm':  { widthMm: 112, printMm: 102, itemCh: 33, qtyCh: 6,  rateCh: 10, amtCh: 12, fontSize: 9   },
};

function getProfile(size, customMm) {
  if (size === 'custom' && customMm > 0) {
    const w = Number(customMm);
    const print = w - 8;
    // Scale columns proportionally from the 80mm baseline
    const scale = print / 72;
    return {
      widthMm: w, printMm: print,
      itemCh: Math.floor(22 * scale),
      qtyCh:  Math.floor(5  * scale),
      rateCh: Math.floor(8  * scale),
      amtCh:  Math.floor(9  * scale),
      fontSize: 8.5,
    };
  }
  return PROFILES[size] || PROFILES['80mm'];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const esc  = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const money = (n) => Number(n || 0).toFixed(2);
const pad   = (s, len, right = false) => {
  const str = String(s ?? '');
  return right
    ? str.padStart(len, ' ')
    : str.padEnd(len, ' ');
};

/** Wrap a product name to fit within itemCh characters. */
function wrapName(name, itemCh) {
  const words = String(name || '').split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + (cur ? ' ' : '') + w).length <= itemCh) {
      cur += (cur ? ' ' : '') + w;
    } else {
      if (cur) lines.push(cur);
      cur = w.slice(0, itemCh);
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** Separator line that fills the printable width. */
function divider(ch = '-', repeat = 40) {
  return ch.repeat(repeat);
}

/** Right-align a value within a total width using HTML spans. */
const rowHtml = (left, right) =>
  `<div class="row"><span class="left">${esc(left)}</span><span class="right">${esc(right)}</span></div>`;

/** QR code image tag using Google Charts API (works offline via data URI workaround). */
function qrImgTag(data, size = 80) {
  const encoded = encodeURIComponent(data);
  return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}" width="${size}" height="${size}" alt="QR" style="display:block;margin:6px auto 0;" />`;
}

// ─── Main builder ─────────────────────────────────────────────────────────────
/**
 * @param {object} invoice   — Sequelize invoice instance (plain object or with associations)
 * @param {object} company   — Company settings object
 * @param {object} opts      — Printer options
 *   @param {string}  opts.size           — '58mm' | '80mm' | '110mm' | '112mm' | 'custom'
 *   @param {number}  [opts.customMm]     — mm when size='custom'
 *   @param {boolean} [opts.showLogo]     — include logo (img tag from company.logoUrl)
 *   @param {boolean} [opts.showGst]      — show CGST/SGST/IGST breakdown
 *   @param {boolean} [opts.showQr]       — show QR code
 *   @param {string}  [opts.qrData]       — QR code content (default: invoiceNumber|total)
 *   @param {boolean} [opts.showHsn]      — show HSN code per item
 *   @param {string}  [opts.footer]       — custom footer message
 *   @param {string}  [opts.title]        — receipt title (default: 'TAX INVOICE')
 *   @param {boolean} [opts.showPayment]  — show payment method
 *   @param {boolean} [opts.duplicate]    — print "DUPLICATE" watermark
 */
export function buildThermalHtml(invoice, company, opts = {}) {
  const size     = opts.size || '80mm';
  const profile  = getProfile(size, opts.customMm);
  const { widthMm, printMm, itemCh, qtyCh, rateCh, amtCh, fontSize } = profile;
  const dashCount = Math.max(20, Math.floor(printMm / 2.2)); // approx chars per line in monospace

  const title       = opts.title || 'TAX INVOICE';
  const showGst     = opts.showGst !== false;
  const showQr      = opts.showQr !== false;
  const showHsn     = opts.showHsn === true;
  const showLogo    = opts.showLogo === true && company?.logoUrl;
  const showPayment = opts.showPayment !== false;
  const footer      = opts.footer || company?.receiptFooter || 'Thank you for your business!';
  const isDuplicate = opts.duplicate === true;

  const items = invoice.InvoiceItems || invoice.items || [];
  const cust  = invoice.Customer || {};

  // ── Header ────────────────────────────────────────────────────────────────
  let html = '';

  // Logo
  if (showLogo) {
    html += `<div style="text-align:center;margin-bottom:4px"><img src="${esc(company.logoUrl)}" style="max-width:${Math.min(printMm * 0.6, 60)}mm;max-height:16mm;object-fit:contain" /></div>`;
  }

  // Duplicate watermark
  if (isDuplicate) {
    html += `<div class="duplicate">DUPLICATE</div>`;
  }

  // Company name
  html += `<div class="company-name">${esc(company?.name || 'Store')}</div>`;

  // Company details
  const compDetails = [
    company?.address,
    company?.city && company?.state ? `${company.city}, ${company.state}` : (company?.city || company?.state || ''),
    company?.phone ? `Ph: ${company.phone}` : '',
    company?.email || '',
    company?.gstNumber ? `GSTIN: ${company.gstNumber}` : '',
  ].filter(Boolean);
  compDetails.forEach(d => { html += `<div class="center small">${esc(d)}</div>`; });

  html += `<div class="divider">${divider('-', dashCount)}</div>`;
  html += `<div class="title">${esc(title)}</div>`;
  html += `<div class="divider">${divider('-', dashCount)}</div>`;

  // Invoice meta
  html += `<div class="row"><span class="left">Invoice #</span><span class="right bold">${esc(invoice.invoiceNumber)}</span></div>`;
  html += `<div class="row"><span class="left">Date</span><span class="right">${esc(invoice.invoiceDate)}</span></div>`;
  if (cust.customerName) {
    html += `<div class="row"><span class="left">Customer</span><span class="right">${esc(cust.customerName)}</span></div>`;
  }
  if (cust.phone) {
    html += `<div class="row"><span class="left">Phone</span><span class="right">${esc(cust.phone)}</span></div>`;
  }
  if (invoice.orderNumber) {
    html += `<div class="row"><span class="left">Order #</span><span class="right">${esc(invoice.orderNumber)}</span></div>`;
  }
  if (showPayment && invoice.paymentMethod) {
    html += `<div class="row"><span class="left">Payment</span><span class="right">${esc(invoice.paymentMethod)}</span></div>`;
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  html += `<div class="divider">${divider('-', dashCount)}</div>`;

  // Column headers (monospace)
  html += `<div class="mono items-header">`;
  html += `<span>${pad('Item', itemCh)}</span>`;
  html += `<span>${pad('Qty', qtyCh, true)}</span>`;
  html += `<span>${pad('Rate', rateCh, true)}</span>`;
  html += `<span>${pad('Amt', amtCh, true)}</span>`;
  html += `</div>`;
  html += `<div class="divider">${divider('-', dashCount)}</div>`;

  let slNo = 1;
  for (const item of items) {
    const name  = formatProductTitle(item) || item.Product?.productName || item.productName || `Item ${slNo}`;
    const qty   = money(item.quantity);
    const rate  = money(item.rate || item.sellingPrice || 0);
    const amt   = money(item.amount || (Number(item.quantity) * Number(item.rate || 0)));
    const lines = wrapName(name, itemCh);

    // First line: name + figures
    html += `<div class="mono">`;
    html += `<span>${pad(lines[0], itemCh)}</span>`;
    html += `<span>${pad(qty, qtyCh, true)}</span>`;
    html += `<span>${pad(rate, rateCh, true)}</span>`;
    html += `<span>${pad(amt, amtCh, true)}</span>`;
    html += `</div>`;

    // Continuation lines (name overflow)
    for (let i = 1; i < lines.length; i++) {
      html += `<div class="mono"><span>${pad(lines[i], itemCh)}</span></div>`;
    }

    // HSN line (optional)
    if (showHsn && item.Product?.hsnCode) {
      html += `<div class="mono small muted"><span>  HSN: ${esc(item.Product.hsnCode)}</span></div>`;
    }

    slNo++;
  }

  html += `<div class="divider">${divider('-', dashCount)}</div>`;

  // ── Totals ────────────────────────────────────────────────────────────────
  html += rowHtml('Subtotal', `Rs.${money(invoice.subtotal)}`);

  if (showGst) {
    const cgst = Number(invoice.cgst || 0);
    const sgst = Number(invoice.sgst || 0);
    const igst = Number(invoice.igst || 0);
    if (igst > 0) {
      html += rowHtml('IGST', `Rs.${money(igst)}`);
    } else if (cgst > 0 || sgst > 0) {
      html += rowHtml('CGST', `Rs.${money(cgst)}`);
      html += rowHtml('SGST', `Rs.${money(sgst)}`);
    }
  }

  // Additional charges
  if (Number(invoice.packingCharge) > 0)  html += rowHtml('Packing', `Rs.${money(invoice.packingCharge)}`);
  if (Number(invoice.freightCharge) > 0)  html += rowHtml('Freight', `Rs.${money(invoice.freightCharge)}`);
  if (Number(invoice.otherCharges) > 0)   html += rowHtml('Other charges', `Rs.${money(invoice.otherCharges)}`);
  if (Number(invoice.cashDiscount) > 0)   html += rowHtml('Discount', `-Rs.${money(invoice.cashDiscount)}`);
  if (Number(invoice.cess) > 0)           html += rowHtml('Cess', `Rs.${money(invoice.cess)}`);
  if (Number(invoice.roundOff) !== 0)     html += rowHtml('Round off', `Rs.${money(invoice.roundOff)}`);

  html += `<div class="divider">${divider('=', dashCount)}</div>`;
  html += `<div class="grand-total">${rowHtml('TOTAL', `Rs.${money(invoice.grandTotal)}`)}</div>`;
  html += `<div class="divider">${divider('=', dashCount)}</div>`;

  // Amount in words
  if (invoice.amountInWords) {
    html += `<div class="small muted" style="margin-top:3px">${esc(invoice.amountInWords)}</div>`;
  }

  // ── QR code ───────────────────────────────────────────────────────────────
  if (showQr) {
    const qrData = opts.qrData || `${invoice.invoiceNumber}|Rs.${money(invoice.grandTotal)}`;
    const qrSize = widthMm <= 58 ? 60 : widthMm <= 80 ? 80 : 100;
    html += qrImgTag(qrData, qrSize);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  if (footer) {
    html += `<div class="divider">${divider('-', dashCount)}</div>`;
    html += `<div class="footer">${esc(footer)}</div>`;
  }

  // Authorised signatory line (blank space for stamp)
  html += `<div style="margin-top:14px;text-align:right;font-size:${fontSize - 0.5}pt">`;
  html += `Authorised Signatory<br/>_________________`;
  html += `</div>`;

  // Cut mark
  html += `<div class="cut-mark">✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─</div>`;

  // ── Full document ─────────────────────────────────────────────────────────
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)} — ${esc(invoice.invoiceNumber)}</title>
<style>
  @page {
    width: ${widthMm}mm;
    margin: 4mm 4mm 6mm 4mm;
    size: ${widthMm}mm auto;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: ${fontSize}pt;
    color: #000;
    width: ${widthMm}mm;
    max-width: ${widthMm}mm;
    padding: 0;
  }
  .company-name {
    font-size: ${fontSize + 3}pt;
    font-weight: bold;
    text-align: center;
    margin-bottom: 2px;
  }
  .title {
    font-size: ${fontSize + 1}pt;
    font-weight: bold;
    text-align: center;
    letter-spacing: 1px;
    margin: 2px 0;
  }
  .center { text-align: center; }
  .small  { font-size: ${fontSize - 0.5}pt; }
  .bold   { font-weight: bold; }
  .muted  { color: #555; }
  .divider {
    font-size: ${fontSize - 1}pt;
    color: #333;
    letter-spacing: 0;
    margin: 2px 0;
    white-space: nowrap;
    overflow: hidden;
  }
  .mono {
    display: flex;
    font-family: 'Courier New', monospace;
    font-size: ${fontSize}pt;
    white-space: pre;
    line-height: 1.4;
  }
  .mono span { display: inline-block; }
  .items-header { font-weight: bold; }
  .row {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
    font-size: ${fontSize}pt;
  }
  .row .left  { flex: 1; }
  .row .right { text-align: right; }
  .grand-total .row {
    font-weight: bold;
    font-size: ${fontSize + 2}pt;
  }
  .footer {
    text-align: center;
    font-size: ${fontSize - 0.5}pt;
    margin: 3px 0;
    white-space: pre-wrap;
  }
  .cut-mark {
    text-align: center;
    font-size: ${fontSize - 1.5}pt;
    color: #aaa;
    margin-top: 8px;
    letter-spacing: 1px;
  }
  .duplicate {
    text-align: center;
    font-size: ${fontSize + 4}pt;
    font-weight: bold;
    border: 2px solid #000;
    padding: 2px 0;
    letter-spacing: 4px;
    margin-bottom: 4px;
  }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

/** Available paper sizes for UI dropdowns. */
export const THERMAL_SIZES = [
  { value: '58mm',   label: '58mm (Small)' },
  { value: '80mm',   label: '80mm (Standard)' },
  { value: '110mm',  label: '110mm (Wide)' },
  { value: '112mm',  label: '112mm (Wide+)' },
  { value: 'custom', label: 'Custom…' },
];

/** Return a paper-size label for display. */
function thermalSizeLabel(size, customMm) {
  if (size === 'custom') return `Custom (${customMm}mm)`;
  return THERMAL_SIZES.find(s => s.value === size)?.label ?? size;
}
