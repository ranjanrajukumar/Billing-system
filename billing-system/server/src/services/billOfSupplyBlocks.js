/**
 * Blocks that reproduce a classic Indian bill-of-supply layout: boxed
 * two-column document/party details, an items grid with packing and UM, and
 * the charge boxes along the foot.
 *
 * Kept separate from the general blocks so the plainer templates stay simple.
 */

import { formatPackage, formatProductTitle } from '../utils/productFormatters.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
const money = (value) => Number(value || 0).toFixed(2);
const dash = (value) => (value ? esc(value) : '');

/** Letterhead with the full registration set, as printed across the top. */
export function renderLetterhead(_block, { company, template, mediaBase }) {
  const name = template?.companyName || company?.name || 'Company Name';
  const lines = [
    [company?.address, company?.city, company?.pincode].filter(Boolean).join(', '),
    [company?.mobile && `Phone - ${company.mobile}`, company?.email && `Email- ${company.email}`,
      company?.panNumber && `PAN - ${company.panNumber}`].filter(Boolean).join('   '),
    [company?.gstNumber && `GSTIN-${company.gstNumber}`, company?.licenseNo && `License No: ${company.licenseNo}`,
      company?.cin && company.cin].filter(Boolean).join('   '),
    company?.msmeReg && `MSME REG. NO. ${company.msmeReg}`,
  ].filter(Boolean);

  const logo = company?.logoUrl
    ? `<img class="logo" src="${esc(mediaBase + company.logoUrl)}" alt="">`
    : '';

  return `<div class="row letterhead">
    <div>
      <div class="firm-name">${esc(name)}</div>
      ${lines.map((l) => `<div class="fine">${esc(l)}</div>`).join('')}
    </div>
    <div>${logo}</div>
  </div>`;
}

/** Boxed "Invoice Details" beside "Billed To". */
export function renderPartyGrid(_block, { invoice, company }) {
  const c = invoice.Customer || {};
  const row = (label, value, date) => (value || date
    ? `<div class="kv"><span>${esc(label)}</span><span>${dash(value)}</span>${date ? `<span class="fine">Date: ${esc(date)}</span>` : '<span></span>'}</div>`
    : '');

  return `<table class="grid"><thead><tr>
      <th style="width:52%">Invoice Details</th>
      <th style="width:48%">Billed To</th>
    </tr></thead><tbody><tr>
      <td class="pad">
        ${row('Invoice No', invoice.invoiceNumber, invoice.invoiceDate)}
        ${row('Order No', invoice.orderNumber, invoice.orderDate)}
        ${row('DM No', invoice.dmNumber, invoice.dmDate)}
        ${row('Manual DM', invoice.manualDm, invoice.manualDmDate)}
        ${invoice.transporter ? `<div class="kv"><span>Transporter</span><span colspan="2">${esc(invoice.transporter)}</span><span></span></div>` : ''}
        ${row('Vehicle No', invoice.vehicleNo)}
        ${row('LR', invoice.lrNumber)}
        <div class="kv"><span>State</span><span>${dash(company?.state)}</span><span class="fine">GSTIN: ${dash(company?.gstNumber)}</span></div>
      </td>
      <td class="pad">
        <div><strong>${esc(c.customerName || '')}</strong></div>
        <div>${dash(c.address)}</div>
        <div>City : ${dash(c.city)}${c.pincode ? `   Pin : ${esc(c.pincode)}` : ''}</div>
        <div>Mobile : ${dash(c.mobileNumber)}</div>
        <div>State : ${dash(c.state)}</div>
        <div>GSTIN : ${dash(c.gstNumber)}</div>
      </td>
    </tr></tbody></table>`;
}

/** Items grid with SR No, packing and unit of measure. */
export function renderBillItems(_block, { invoice }) {
  const items = invoice.InvoiceItems || [];
  // Seed lot details only earn their columns when the sale actually has them,
  // so bills for untracked products print exactly as they always did.
  const showBatch = items.some((item) => item.batchNumber);
  const columns = showBatch ? 12 : 9;

  const rows = items.length
    ? items.map((item, i) => {
      const gross = Number(item.quantity) * Number(item.rate);
      const discPercent = gross > 0 ? (Number(item.discount || 0) / gross) * 100 : 0;
      const batchCells = showBatch
        ? `<td>${dash(item.batchNumber)}</td>
        <td class="num">${item.germinationPercent != null ? `${Number(item.germinationPercent).toFixed(0)}%` : '-'}</td>
        <td>${dash(item.expiryDate)}</td>`
        : '';
      return `<tr>
        <td class="num">${i + 1}</td>
        <td>${esc(formatProductTitle(item))}</td>
        <td>${dash(item.Product?.hsnCode)}</td>
        ${batchCells}
        <td>${dash(item.packing || formatPackage(item))}</td>
        <td>${dash(item.um)}</td>
        <td class="num">${money(item.quantity)}</td>
        <td class="num">${money(item.rate)}</td>
        <td class="num">${discPercent ? discPercent.toFixed(2) : '0.00'}</td>
        <td class="num">${money(item.amount)}</td>
      </tr>`;
    }).join('')
    : `<tr><td colspan="${columns}" class="muted">No items</td></tr>`;

  // Blank rows keep the box the same height as the printed stationery.
  const blankRow = `<tr class="filler"><td>&nbsp;</td>${'<td></td>'.repeat(columns - 1)}</tr>`;
  const filler = blankRow.repeat(Math.max(0, 6 - items.length));

  const batchHeads = showBatch
    ? '<th>Lot / Batch</th><th class="num">Germ.%</th><th>Valid Upto</th>'
    : '';

  return `<table class="grid items"><thead><tr>
      <th class="num">SR No</th><th>Product Description</th><th>HSN Code</th>
      ${batchHeads}
      <th>Packing</th><th>UM</th>
      <th class="num">Quantity</th><th class="num">Rate</th><th class="num">Disc.(%)</th><th class="num">Amount</th>
    </tr></thead><tbody>${rows}${filler}</tbody></table>`;
}

/** The discount boxes on the left and the value column on the right. */
export function renderChargeGrid(_block, { invoice }) {
  const totalQty = (invoice.InvoiceItems || []).reduce((sum, i) => sum + Number(i.quantity || 0), 0);
  const addition = Number(invoice.packingCharge || 0) + Number(invoice.freightCharge || 0) + Number(invoice.otherCharges || 0);
  const deduction = Number(invoice.quantityDiscount || 0) + Number(invoice.cashDiscount || 0)
    + Number(invoice.specialDiscount || 0) + Number(invoice.freightDeducted || 0);
  // subtotal is already net of every adjustment, so undo them to show what the
  // goods themselves came to.
  const productValue = Number(invoice.subtotal) + Number(invoice.couponDiscount || 0)
    + Number(invoice.pointsDiscount || 0) + deduction - addition;

  const box = (label, value) => `<div class="chargebox"><span class="fine">${esc(label)}</span><span>${money(value)}</span></div>`;
  const line = (label, value) => `<div class="kv2"><span>${esc(label)}</span><span>${money(value)}</span></div>`;

  return `<table class="grid"><tbody><tr>
      <td class="pad" style="width:56%">
        <div class="charges">
          ${box('Quantity Disc.(-)', invoice.quantityDiscount)}
          ${box('Cash Discount(-)', invoice.cashDiscount)}
          ${box('Special Discount(-)', invoice.specialDiscount)}
          ${box('Freight(-)', invoice.freightDeducted)}
          ${box('Packing(+)', invoice.packingCharge)}
          ${box('Freight(+)', invoice.freightCharge)}
          ${box('Other Charges(+)', invoice.otherCharges)}
          ${box('Total Qty.', totalQty)}
          ${box('Total Bags', invoice.totalBags)}
        </div>
      </td>
      <td class="pad" style="width:44%">
        ${line('Product Value', productValue)}
        ${line('Addition', addition)}
        ${line('Deduction', deduction)}
        ${line('Amount Before Tax', invoice.subtotal)}
        ${line('CGST', invoice.cgst)}
        ${line('SGST', invoice.sgst)}
        ${line('IGST', invoice.igst)}
        ${line('CESS', invoice.cess)}
        ${line('Round Off', invoice.roundOff)}
        <div class="kv2 grandline"><span>Amount After Tax</span><span>${money(invoice.grandTotal)}</span></div>
      </td>
    </tr></tbody></table>`;
}

/** Amount in words plus the remark line. */
export function renderWordsRemark(_block, { invoice }) {
  return `<table class="grid"><tbody>
    <tr><td class="pad"><span class="fine">Amount in Words</span><br>${esc(invoice.amountInWords || '')}</td></tr>
    <tr><td class="pad"><span class="fine">Remark -</span> ${dash(invoice.remark)}</td></tr>
  </tbody></table>`;
}

/** Bank details and terms on the left, certification and seal on the right. */
export function renderFooterGrid(_block, { company, template }) {
  const name = template?.companyName || company?.name || '';
  const terms = String(template?.declaration || '')
    .split('\n').filter(Boolean)
    .map((t, i) => `<div class="fine">${i + 1}) ${esc(t)}</div>`).join('');

  return `<table class="grid"><tbody><tr>
      <td class="pad" style="width:58%">
        <div class="fine"><strong>Bank Details:-</strong></div>
        <div class="fine">Bank : ${dash(template?.bankName)}</div>
        <div class="fine">A/C No : ${dash(template?.accountNumber)}</div>
        <div class="fine">IFSC : ${dash(template?.ifscCode)}</div>
        ${template?.upiId ? `<div class="fine">UPI : ${esc(template.upiId)}</div>` : ''}
        <div class="fine" style="margin-top:6px"><strong>Terms &amp; Conditions -</strong></div>
        ${terms}
      </td>
      <td class="pad" style="width:42%; text-align:right">
        <div class="fine">Certified that the particulars given above are true &amp; correct</div>
        <div style="margin-top:6px"><strong>For ${esc(name)}</strong></div>
        <div class="seal">COMMON SEAL</div>
        <div class="sign-line">${esc(template?.authorizedSignatory || 'Authorised Signatory')}</div>
      </td>
    </tr></tbody></table>`;
}

/** The page marker and the tax-free stamp along the very bottom. */
export function renderPageFoot(_block, { template }) {
  return `<div class="row pagefoot">
    <div class="fine">Page 1 of 1</div>
    <div class="fine" style="text-align:center">${esc(template?.footerMessage || '')}</div>
    <div class="stamp">TAX FREE</div>
  </div>`;
}

export const BILL_OF_SUPPLY_STYLES = `
  .letterhead { border: 1px solid #000; padding: 6px 8px; align-items: flex-start; }
  .firm-name { font-size: 17px; font-weight: bold; letter-spacing: 0.3px; }
  .fine { font-size: 10px; }
  table.grid { border-collapse: collapse; width: 100%; }
  table.grid th, table.grid td { border: 1px solid #000; vertical-align: top; }
  table.grid th { background: #f2f2f2; font-size: 10px; padding: 3px 5px; text-align: center; }
  table.grid td.pad { padding: 5px 6px; font-size: 10.5px; }
  table.items th, table.items td { padding: 3px 5px; font-size: 10.5px; }
  table.items td.num, table.items th.num { text-align: right; }
  tr.filler td { height: 16px; }
  .kv { display: grid; grid-template-columns: 90px 1fr 130px; gap: 4px; }
  .kv2 { display: flex; justify-content: space-between; padding: 1px 0; font-size: 10.5px; }
  .grandline { border-top: 1px solid #000; margin-top: 3px; padding-top: 3px; font-weight: bold; }
  .charges { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .chargebox { display: flex; flex-direction: column; border: 1px solid #999; padding: 2px 4px; }
  .seal { margin: 26px 0 4px; font-size: 10px; letter-spacing: 1px; }
  .pagefoot { margin-top: 6px; align-items: center; }
  .stamp { border: 2px solid #1a3fb0; color: #1a3fb0; font-weight: bold; padding: 2px 10px; letter-spacing: 1px; }
`;
