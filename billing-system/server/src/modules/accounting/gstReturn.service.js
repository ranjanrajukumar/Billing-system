import { Op } from 'sequelize';
import ExcelJS from 'exceljs';
import { Company, Customer, Invoice, InvoiceItem, Product } from '../../models/index.js';

/**
 * GSTR-1 style outward supply summary.
 *
 * This produces the working papers a filer needs — the B2B/B2C split, the rate
 * wise tax breakup and the HSN summary — in the layout of the GST portal's
 * offline utility. It is a preparation aid, not a JSON filing: the return still
 * goes through the portal, and the figures should be checked before filing.
 */

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/** A GSTIN means a registered buyer, which is what splits B2B from B2C. */
const isB2B = (invoice) => Boolean(invoice.Customer?.gstNumber?.trim());

/** GST portal convention: place of supply is the buyer's state. */
const placeOfSupply = (invoice) => invoice.Customer?.state || '';

export async function gstr1Data({ from, to }) {
  const company = await Company.findOne();
  const invoices = await Invoice.findAll({
    where: {
      detstatus: false,
      invoiceDate: { [Op.between]: [from, to] },
    },
    include: [
      { model: Customer, attributes: ['id', 'customerName', 'gstNumber', 'state'] },
      { model: InvoiceItem, include: [{ model: Product, attributes: ['productName', 'hsnCode'] }] },
    ],
    order: [['invoiceDate', 'ASC'], ['invoiceNumber', 'ASC']],
  });

  const b2b = [];
  const b2c = [];
  // Rate-wise totals, and the HSN summary the return asks for separately.
  const rateSummary = new Map();
  const hsnSummary = new Map();

  for (const invoice of invoices) {
    const taxable = round2(invoice.subtotal);
    const cgst = round2(invoice.cgst);
    const sgst = round2(invoice.sgst);
    const igst = round2(invoice.igst);

    // The rate is taken from the lines, since an invoice can mix rates.
    const rates = [...new Set((invoice.InvoiceItems || []).map((i) => Number(i.gstPercent || 0)))];

    const row = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      customerName: invoice.Customer?.customerName || '',
      gstin: invoice.Customer?.gstNumber || '',
      placeOfSupply: placeOfSupply(invoice),
      // Reverse charge and e-commerce are not modelled, so they are reported as
      // "N" rather than left blank and silently assumed.
      reverseCharge: 'N',
      invoiceValue: round2(invoice.grandTotal),
      rate: rates.length === 1 ? rates[0] : 'Mixed',
      taxableValue: taxable,
      cgst,
      sgst,
      igst,
      cess: round2(invoice.cess),
    };
    (isB2B(invoice) ? b2b : b2c).push(row);

    for (const item of invoice.InvoiceItems || []) {
      const rate = Number(item.gstPercent || 0);
      const lineTax = round2(item.gstAmount);
      const lineTaxable = round2(Number(item.amount) - Number(item.gstAmount));

      const rateKey = `${rate}`;
      const rateRow = rateSummary.get(rateKey)
        || { rate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, invoices: new Set() };
      rateRow.taxableValue += lineTaxable;
      // Split the line's tax the same way the invoice was split.
      if (Number(invoice.igst) > 0) rateRow.igst += lineTax;
      else { rateRow.cgst += lineTax / 2; rateRow.sgst += lineTax / 2; }
      rateRow.invoices.add(invoice.id);
      rateSummary.set(rateKey, rateRow);

      const hsn = item.Product?.hsnCode || 'UNSPECIFIED';
      const hsnKey = `${hsn}|${rate}`;
      const hsnRow = hsnSummary.get(hsnKey)
        || {
          hsn,
          description: item.Product?.productName || '',
          uqc: item.um || 'NOS',
          rate,
          quantity: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          totalValue: 0,
        };
      hsnRow.quantity += Number(item.quantity || 0);
      hsnRow.taxableValue += lineTaxable;
      hsnRow.totalValue += Number(item.amount || 0);
      if (Number(invoice.igst) > 0) hsnRow.igst += lineTax;
      else { hsnRow.cgst += lineTax / 2; hsnRow.sgst += lineTax / 2; }
      hsnSummary.set(hsnKey, hsnRow);
    }
  }

  const tidyRate = [...rateSummary.values()]
    .map((r) => ({
      rate: r.rate,
      invoiceCount: r.invoices.size,
      taxableValue: round2(r.taxableValue),
      cgst: round2(r.cgst),
      sgst: round2(r.sgst),
      igst: round2(r.igst),
    }))
    .sort((a, b) => a.rate - b.rate);

  const tidyHsn = [...hsnSummary.values()]
    .map((h) => ({
      ...h,
      quantity: round2(h.quantity),
      taxableValue: round2(h.taxableValue),
      cgst: round2(h.cgst),
      sgst: round2(h.sgst),
      igst: round2(h.igst),
      totalValue: round2(h.totalValue),
    }))
    .sort((a, b) => String(a.hsn).localeCompare(String(b.hsn)));

  const sum = (rows, key) => round2(rows.reduce((s, r) => s + Number(r[key] || 0), 0));

  return {
    period: { from, to },
    company: {
      name: company?.name || '',
      gstin: company?.gstNumber || '',
      state: company?.state || '',
    },
    b2b,
    b2c,
    rateSummary: tidyRate,
    hsnSummary: tidyHsn,
    totals: {
      invoiceCount: invoices.length,
      b2bCount: b2b.length,
      b2cCount: b2c.length,
      taxableValue: sum([...b2b, ...b2c], 'taxableValue'),
      cgst: sum([...b2b, ...b2c], 'cgst'),
      sgst: sum([...b2b, ...b2c], 'sgst'),
      igst: sum([...b2b, ...b2c], 'igst'),
      cess: sum([...b2b, ...b2c], 'cess'),
      invoiceValue: sum([...b2b, ...b2c], 'invoiceValue'),
    },
  };
}

/** The same figures as a multi-sheet workbook, laid out like the GST utility. */
export async function gstr1Workbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = data.company.name || 'Billing System';

  const addSheet = (name, columns, rows) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns.map((c) => ({ ...c, width: c.width || Math.max(c.header.length + 4, 14) }));
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return sheet;
  };

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ header: 'Field', key: 'field', width: 28 }, { header: 'Value', key: 'value', width: 34 }];
  [
    ['GSTIN', data.company.gstin],
    ['Legal name', data.company.name],
    ['State', data.company.state],
    ['Period from', data.period.from],
    ['Period to', data.period.to],
    ['Total invoices', data.totals.invoiceCount],
    ['B2B invoices', data.totals.b2bCount],
    ['B2C invoices', data.totals.b2cCount],
    ['Total taxable value', data.totals.taxableValue],
    ['Total CGST', data.totals.cgst],
    ['Total SGST', data.totals.sgst],
    ['Total IGST', data.totals.igst],
    ['Total cess', data.totals.cess],
    ['Total invoice value', data.totals.invoiceValue],
  ].forEach(([field, value]) => summary.addRow({ field, value }));
  summary.getColumn('field').font = { bold: true };

  const invoiceColumns = [
    { header: 'GSTIN/UIN of Recipient', key: 'gstin' },
    { header: 'Receiver Name', key: 'customerName', width: 30 },
    { header: 'Invoice Number', key: 'invoiceNumber' },
    { header: 'Invoice date', key: 'invoiceDate' },
    { header: 'Invoice Value', key: 'invoiceValue' },
    { header: 'Place Of Supply', key: 'placeOfSupply', width: 18 },
    { header: 'Reverse Charge', key: 'reverseCharge' },
    { header: 'Rate', key: 'rate' },
    { header: 'Taxable Value', key: 'taxableValue' },
    { header: 'Cess Amount', key: 'cess' },
  ];
  addSheet('b2b', invoiceColumns, data.b2b);
  addSheet('b2cs', invoiceColumns, data.b2c);

  addSheet('Rate summary', [
    { header: 'Rate', key: 'rate' },
    { header: 'Invoices', key: 'invoiceCount' },
    { header: 'Taxable Value', key: 'taxableValue' },
    { header: 'CGST', key: 'cgst' },
    { header: 'SGST', key: 'sgst' },
    { header: 'IGST', key: 'igst' },
  ], data.rateSummary);

  addSheet('hsn', [
    { header: 'HSN', key: 'hsn' },
    { header: 'Description', key: 'description', width: 34 },
    { header: 'UQC', key: 'uqc' },
    { header: 'Total Quantity', key: 'quantity' },
    { header: 'Total Value', key: 'totalValue' },
    { header: 'Taxable Value', key: 'taxableValue' },
    { header: 'Integrated Tax Amount', key: 'igst', width: 20 },
    { header: 'Central Tax Amount', key: 'cgst', width: 20 },
    { header: 'State/UT Tax Amount', key: 'sgst', width: 20 },
  ], data.hsnSummary);

  return workbook.xlsx.writeBuffer();
}
