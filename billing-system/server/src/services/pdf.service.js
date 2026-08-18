import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { formatProductTitle } from '../utils/productFormatters.js';

const money = (n) => Number(n || 0).toFixed(2);

// Logos live in the database as bytes. PDFKit accepts a Buffer directly; the
// disk fallback keeps company records that predate the migration rendering.
function companyLogo(company) {
  if (company?.logoData) return company.logoData;
  if (company?.logoPath) {
    const logoFile = path.join(process.cwd(), company.logoPath);
    if (fs.existsSync(logoFile)) return logoFile;
  }
  return null;
}

export async function buildInvoicePdf(invoice, company, template = 'standard', title = 'TAX INVOICE') {
  const qr = await QRCode.toBuffer(`${invoice.invoiceNumber}|${invoice.grandTotal}`);
  
  return new Promise((resolve) => {
    let tplName = typeof template === 'string' ? template : 'dynamic';
    let config = typeof template === 'object' ? template : null;
    
    const isThermal = tplName === 'thermal' || ['80mm Thermal','58mm Thermal','110mm Thermal','112mm Thermal'].includes(config?.paperSize);

    // Map paper-size label → pt width.  1mm ≈ 2.8346pt
    const THERMAL_WIDTHS = {
      '58mm Thermal':  164,
      '80mm Thermal':  226,
      '110mm Thermal': 311,
      '112mm Thermal': 317,
    };
    // For custom, the config may carry the raw mm value.
    const customPtWidth = config?.customPaperMm ? Math.round(Number(config.customPaperMm) * 2.8346) : 0;

    const thermalWidthPt = THERMAL_WIDTHS[config?.paperSize] || customPtWidth || 226;

    let paperWidth = isThermal ? thermalWidthPt
      : config?.paperSize === 'A5' ? 419 : 595;
    const paperHeight = config?.paperSize === 'A5' ? 595 : 842;
    const isLandscape = config?.orientation === 'Landscape';

    let size = isThermal ? [thermalWidthPt, 800] : (isLandscape ? [paperHeight, paperWidth] : [paperWidth, paperHeight]);


    const doc = new PDFDocument({ margin: isThermal ? 10 : (tplName === 'compact' ? 20 : 40), size });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    if (tplName === 'dynamic' && config) {
      doc.fontSize(20).text(config.companyName || company?.name || 'Billing System', { align: 'center' });
      doc.fontSize(10).text(config.address || company?.address || '', { align: 'center' });
      if (config.showGstNumber && config.gstNumber) {
        doc.text(`GSTIN: ${config.gstNumber}`, { align: 'center' });
      }
      doc.moveDown().fontSize(16).text(title, { align: 'center' });
      doc.moveDown();

      doc.fontSize(10).text(`${config.invoicePrefix || ''}${invoice.invoiceNumber}${config.invoiceSuffix || ''}`);
      doc.text(`Invoice Date: ${invoice.invoiceDate}`);
      
      if (config.showBillingAddress) {
        doc.text(`Billed To: ${invoice.Customer?.customerName || ''}`);
        if (config.showCustomerGst) doc.text(`GSTIN: ${invoice.Customer?.gstNumber || '-'}`);
      }
      doc.moveDown();

      const startY = doc.y;
      const columns = config.showHsnCode ? [40, 160, 220, 290, 340, 400, 470] : [40, 220, 290, 340, 400, 470];
      
      let headers = ['Item'];
      if (config.showHsnCode) headers.push('HSN/SAC');
      headers.push('Qty', 'Rate');
      if (config.showTaxColumns) headers.push('GST');
      if (config.showDiscount) headers.push('Disc.');
      headers.push('Amount');
      
      headers.forEach((h, i) => doc.text(h, columns[i], startY, { width: 80 }));
      doc.moveTo(40, startY + 16).lineTo(size[0] - 40, startY + 16).stroke();
      
      let y = startY + 25;
      invoice.InvoiceItems?.forEach((item) => {
        let colIdx = 0;
        doc.text(formatProductTitle(item), columns[colIdx++], y, { width: 110 });
        if (config.showHsnCode) doc.text(item.Product?.hsnCode || '-', columns[colIdx++], y);
        doc.text(money(item.quantity), columns[colIdx++], y);
        doc.text(money(item.rate), columns[colIdx++], y);
        if (config.showTaxColumns) doc.text(`${money(item.gstPercent)}%`, columns[colIdx++], y);
        if (config.showDiscount) doc.text(money(item.discount), columns[colIdx++], y);
        doc.text(money(item.amount), columns[colIdx++], y);
        y += 22;
      });

      doc.moveDown(3);
      doc.text(`Subtotal: ${money(invoice.subtotal)}`, { align: 'right' });
      
      if (config.showTaxSummary) {
        doc.text(`CGST: ${money(invoice.cgst)}`, { align: 'right' });
        doc.text(`SGST: ${money(invoice.sgst)}`, { align: 'right' });
        doc.text(`IGST: ${money(invoice.igst)}`, { align: 'right' });
      }
      
      doc.fontSize(13).text(`Grand Total: ${money(invoice.grandTotal)}`, { align: 'right' });
      doc.fontSize(10).text(invoice.amountInWords);
      
      if (config.showQrCode) {
        doc.image(qr, 40, doc.y + 10, { width: 80 });
      }
      
      if (config.showFooter) {
        doc.moveDown(5);
        if (config.footerMessage) doc.text(config.footerMessage);
        if (config.declaration) doc.text(config.declaration);
        if (config.bankName) doc.text(`Bank: ${config.bankName}, A/C: ${config.accountNumber}, IFSC: ${config.ifscCode}`);
      }

      if (config.showSignature) {
        doc.text(config.authorizedSignatory || 'Authorized Signatory', size[0] - 150, doc.y - 20, { align: 'right' });
      }

    } else if (isThermal) {
      const margin  = 10;
      const W       = thermalWidthPt - margin * 2;   // printable width in pt
      // Column layout: name takes 55%, qty 13%, rate 16%, amount 16%
      const nameW  = Math.floor(W * 0.55);
      const qtyX   = margin + nameW + 2;
      const qtyW   = Math.floor(W * 0.13);
      const rateX  = qtyX + qtyW + 2;
      const rateW  = Math.floor(W * 0.16);
      const amtX   = rateX + rateW + 2;
      const amtW   = W - nameW - qtyW - rateW - 6;
      const rightX = margin + W;                     // right-edge for totals

      doc.fontSize(12).text(company?.name || 'Billing System', { align: 'center' });
      doc.fontSize(8).text(company?.address || '', { align: 'center' });
      if (company?.gstNumber) doc.text(`GSTIN: ${company.gstNumber}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.text('─'.repeat(Math.floor(W / 5.5)), { align: 'center' });
      doc.fontSize(10).text(title, { align: 'center' });
      doc.text('─'.repeat(Math.floor(W / 5.5)), { align: 'center' });

      doc.fontSize(8).text(`Inv: ${invoice.invoiceNumber}`);
      doc.text(`Date: ${invoice.invoiceDate}`);
      doc.text(`To: ${invoice.Customer?.customerName || ''}`);
      doc.text('─'.repeat(Math.floor(W / 5.5)), { align: 'center' });

      let y = doc.y;
      // Header row
      doc.text('Item', margin, y, { width: nameW });
      doc.text('Qty',  qtyX,   y, { width: qtyW,  align: 'right' });
      doc.text('Rate', rateX,  y, { width: rateW, align: 'right' });
      doc.text('Amt',  amtX,   y, { width: amtW,  align: 'right' });
      y += 12;
      doc.moveTo(margin, y).lineTo(rightX, y).stroke(); y += 4;

      invoice.InvoiceItems?.forEach((item) => {
        doc.text(formatProductTitle(item), margin, y, { width: nameW });
        doc.text(money(item.quantity), qtyX,  y, { width: qtyW,  align: 'right' });
        doc.text(money(item.rate),     rateX, y, { width: rateW, align: 'right' });
        doc.text(money(item.amount),   amtX,  y, { width: amtW,  align: 'right' });
        y += 13;
        if (item.Product?.hsnCode) {
          doc.fontSize(7).text(`HSN: ${item.Product.hsnCode}`, margin + 4, y, { width: W, color: '#666' });
          doc.fontSize(8);
          y += 9;
        }
      });

      doc.moveTo(margin, y).lineTo(rightX, y).stroke(); y += 5;
      doc.text('Subtotal:',           margin, y); doc.text(money(invoice.subtotal), amtX, y, { width: amtW, align: 'right' }); y += 11;
      doc.text('CGST:',               margin, y); doc.text(money(invoice.cgst),     amtX, y, { width: amtW, align: 'right' }); y += 11;
      doc.text('SGST:',               margin, y); doc.text(money(invoice.sgst),     amtX, y, { width: amtW, align: 'right' }); y += 11;
      if (Number(invoice.igst) > 0) { doc.text('IGST:', margin, y); doc.text(money(invoice.igst), amtX, y, { width: amtW, align: 'right' }); y += 11; }
      doc.moveTo(margin, y).lineTo(rightX, y).stroke(); y += 5;
      doc.fontSize(10).text('TOTAL:', margin, y);
      doc.fontSize(10).text(money(invoice.grandTotal), amtX, y, { width: amtW, align: 'right' });
      y += 22;
      const qrSize = Math.min(80, Math.floor(W * 0.45));
      doc.image(qr, Math.floor((thermalWidthPt - qrSize) / 2), y, { width: qrSize });
      doc.moveDown(5);
    } else if (template === 'premium') {
      const primaryColor = '#243454';
      const secondaryColor = '#E3E9F3';
      const accentColor = '#DFE6F5';

      // Header background
      doc.rect(0, 0, 595, 140).fill(primaryColor);
      
      // Header Text
      let headerX = 40;
      const logo = companyLogo(company);
      if (logo) {
        doc.image(logo, 40, 35, { width: 50 });
        headerX = 100;
      }
      doc.fillColor('#ffffff').fontSize(26).text(company?.name || 'Billing System', headerX, 40);
      doc.fontSize(9).text(company?.address || '', headerX, 75);
      doc.text(`GSTIN: ${company?.gstNumber || '-'}`, headerX, 105);

      doc.fontSize(32).text(title, 350, 40, { width: 200, align: 'right' });
      doc.fontSize(10).text(`Ref No. ${invoice.invoiceNumber}`, 350, 80, { width: 200, align: 'right' });
      doc.text(`Invoice Date:    ${invoice.invoiceDate}`, 350, 105, { width: 200, align: 'right' });
      
      doc.fillColor('#333333');
      doc.moveDown(4);
      
      const detailsY = 160;
      doc.fontSize(11).font('Helvetica-Bold').text('Billed To:', 40, detailsY);
      doc.moveTo(40, detailsY + 15).lineTo(250, detailsY + 15).strokeColor('#cccccc').stroke();
      doc.font('Helvetica').fontSize(11).text(invoice.Customer?.customerName || '', 40, detailsY + 25);
      doc.fontSize(9).text(invoice.Customer?.address || '', 40, detailsY + 40);
      doc.text(`GSTIN: ${invoice.Customer?.gstNumber || '-'}`, 40, detailsY + 55);

      const startY = 250;
      doc.rect(40, startY, 515, 25).fill(primaryColor);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
      const columns = [45, 140, 200, 260, 320, 390, 470];
      ['Item', 'HSN/SAC', 'Qty', 'Rate', 'GST', 'Disc.', 'Amount'].forEach((h, i) => doc.text(h, columns[i], startY + 8, { width: 80 }));
      
      doc.fillColor('#333333').font('Helvetica');
      let y = startY + 35;
      
      invoice.InvoiceItems?.forEach((item, index) => {
        if (index % 2 === 0) {
           doc.rect(40, y - 5, 515, 20).fill(secondaryColor);
           doc.fillColor('#333333');
        }
        
        doc.text(formatProductTitle(item), columns[0], y, { width: 90 });
        doc.text(item.Product?.hsnCode || '-', columns[1], y);
        doc.text(money(item.quantity), columns[2], y);
        doc.text(money(item.rate), columns[3], y);
        doc.text(`${money(item.gstPercent)}%`, columns[4], y);
        doc.text(money(item.discount), columns[5], y);
        doc.text(money(item.amount), columns[6], y);
        y += 20;
      });

      doc.moveTo(40, y).lineTo(555, y).strokeColor('#dddddd').stroke();
      doc.moveDown(2);
      
      y += 15;
      doc.fontSize(10);
      doc.text(`Subtotal:`, 350, y, { width: 100, align: 'right' });
      doc.text(money(invoice.subtotal), 470, y);
      
      const taxAmt = Number(invoice.cgst) + Number(invoice.sgst) + Number(invoice.igst);
      doc.text(`Tax:`, 350, y + 15, { width: 100, align: 'right' });
      doc.text(money(taxAmt), 470, y + 15);
      
      // Amount due highlight box
      doc.rect(330, y + 35, 225, 25).fill(accentColor);
      doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(12);
      doc.text(`Amount Due:`, 350, y + 42, { width: 100, align: 'right' });
      doc.text(money(invoice.grandTotal), 470, y + 42);
      
      doc.fillColor('#333333').font('Helvetica').fontSize(10);
      doc.text(`Amount in words: ${invoice.amountInWords}`, 40, y + 75, { width: 300 });
      doc.image(qr, 40, y + 100, { width: 60 });
      
      if (company?.signatureUrl) {
        doc.text('Authorized Signatory', 400, y + 140, { align: 'right' });
      }
    } else if (template === 'modern') {
      doc.rect(0, 0, 595, 120).fill('#2196f3');
      let headerX = 40;
      const logo = companyLogo(company);
      if (logo) {
        doc.image(logo, 40, 35, { width: 50 });
        headerX = 100;
      }
      doc.fillColor('#ffffff').fontSize(24).text(company?.name || 'Billing System', headerX, 40);
      doc.fontSize(10).text(company?.address || '', headerX, 70);
      doc.fontSize(28).text(title, 350, 40, { width: 200, align: 'right' });
      
      doc.fillColor('#333333');
      doc.moveDown(4);
      doc.fontSize(12).text('BILL TO:', 40, 140, { underline: true });
      doc.fontSize(14).text(invoice.Customer?.customerName || '', 40, 160);
      doc.fontSize(10).text(`GSTIN: ${invoice.Customer?.gstNumber || '-'}`, 40, 180);

      doc.fontSize(10).text(`Invoice No: ${invoice.invoiceNumber}`, 350, 140, { align: 'right' });
      doc.text(`Invoice Date: ${invoice.invoiceDate}`, 350, 160, { align: 'right' });
      
      const startY = 220;
      doc.rect(40, startY, 515, 20).fill('#f5f5f5');
      doc.fillColor('#000000').fontSize(9);
      const columns = [45, 150, 210, 280, 340, 400, 470];
      ['Item', 'HSN/SAC', 'Qty', 'Rate', 'GST', 'Disc.', 'Amount'].forEach((h, i) => doc.text(h, columns[i], startY + 5, { width: 80 }));
      
      let y = startY + 30;
      invoice.InvoiceItems?.forEach((item) => {
        doc.text(formatProductTitle(item), columns[0], y, { width: 100 });
        doc.text(item.Product?.hsnCode || '-', columns[1], y);
        doc.text(money(item.quantity), columns[2], y);
        doc.text(money(item.rate), columns[3], y);
        doc.text(`${money(item.gstPercent)}%`, columns[4], y);
        doc.text(money(item.discount), columns[5], y);
        doc.text(money(item.amount), columns[6], y);
        y += 22;
      });

      doc.moveTo(40, y).lineTo(555, y).strokeColor('#dddddd').stroke();
      doc.moveDown(2);
      
      y += 20;
      doc.fontSize(10);
      doc.text(`Subtotal: ${money(invoice.subtotal)}`, 350, y, { align: 'right' });
      doc.text(`Tax Amount: ${money(Number(invoice.cgst) + Number(invoice.sgst) + Number(invoice.igst))}`, 350, y + 15, { align: 'right' });
      doc.fontSize(14).text(`Grand Total: ${money(invoice.grandTotal)}`, 350, y + 35, { align: 'right' });
      
      doc.fontSize(10).text(invoice.amountInWords, 40, y + 35, { width: 300 });
      doc.image(qr, 40, y + 55, { width: 80 });
      
      if (company?.signatureUrl) {
        // Not actual URL loading in PDF Kit right now unless implemented. But space is left.
        doc.text('Authorized Signatory', 400, y + 100, { align: 'right' });
      }
    } else if (template === 'compact') {
      const logo = companyLogo(company);
      if (logo) {
        doc.image(logo, 20, 20, { width: 30 });
        doc.moveDown(1.5);
      }
      doc.fontSize(14).text(company?.name || 'Billing System');
      doc.fontSize(8).text(company?.address || '');
      doc.moveDown().fontSize(12).text(title, { underline: true });
      doc.moveDown();

      doc.fontSize(8).text(`No: ${invoice.invoiceNumber} | Date: ${invoice.invoiceDate}`);
      doc.text(`To: ${invoice.Customer?.customerName || ''} | GSTIN: ${invoice.Customer?.gstNumber || '-'}`);
      doc.moveDown();

      const startY = doc.y;
      const columns = [20, 150, 210, 280, 340, 400, 470];
      ['Item', 'HSN/SAC', 'Qty', 'Rate', 'GST', 'Disc.', 'Amount'].forEach((h, i) => doc.text(h, columns[i], startY, { width: 80 }));
      doc.moveTo(20, startY + 10).lineTo(575, startY + 10).stroke();
      
      let y = startY + 15;
      invoice.InvoiceItems?.forEach((item) => {
        doc.text(formatProductTitle(item), columns[0], y, { width: 120 });
        doc.text(item.Product?.hsnCode || '-', columns[1], y);
        doc.text(money(item.quantity), columns[2], y);
        doc.text(money(item.rate), columns[3], y);
        doc.text(`${money(item.gstPercent)}%`, columns[4], y);
        doc.text(money(item.discount), columns[5], y);
        doc.text(money(item.amount), columns[6], y);
        y += 15;
      });

      doc.moveTo(20, y).lineTo(575, y).stroke();
      y += 10;
      doc.text(`Total: ${money(invoice.grandTotal)}`, { align: 'right' });
      doc.text(invoice.amountInWords);
      doc.image(qr, 20, doc.y + 10, { width: 50 });
    } else {
      const logo = companyLogo(company);
      if (logo) {
        doc.image(logo, 267, 30, { width: 60, align: 'center' });
        doc.moveDown(3);
      }
      doc.fontSize(20).text(company?.name || 'Billing System', { align: 'center' });
      doc.fontSize(10).text(company?.address || '', { align: 'center' });
      doc.moveDown().fontSize(16).text(title, { align: 'center' });
      doc.moveDown();

      doc.fontSize(10).text(`Invoice No: ${invoice.invoiceNumber}`);
      doc.text(`Invoice Date: ${invoice.invoiceDate}`);
      doc.text(`Customer: ${invoice.Customer?.customerName || ''}`);
      doc.text(`GSTIN: ${invoice.Customer?.gstNumber || '-'}`);
      doc.moveDown();

      const startY = doc.y;
      const columns = [40, 160, 220, 290, 340, 400, 470];
      ['Item', 'HSN/SAC', 'Qty', 'Rate', 'GST', 'Disc.', 'Amount'].forEach((h, i) => doc.text(h, columns[i], startY, { width: 80 }));
      doc.moveTo(40, startY + 16).lineTo(555, startY + 16).stroke();
      
      let y = startY + 25;
      invoice.InvoiceItems?.forEach((item) => {
        doc.text(formatProductTitle(item), columns[0], y, { width: 110 });
        doc.text(item.Product?.hsnCode || '-', columns[1], y);
        doc.text(money(item.quantity), columns[2], y);
        doc.text(money(item.rate), columns[3], y);
        doc.text(`${money(item.gstPercent)}%`, columns[4], y);
        doc.text(money(item.discount), columns[5], y);
        doc.text(money(item.amount), columns[6], y);
        y += 22;
      });

      doc.moveDown(3);
      doc.text(`Subtotal: ${money(invoice.subtotal)}`, { align: 'right' });
      doc.text(`CGST: ${money(invoice.cgst)}`, { align: 'right' });
      doc.text(`SGST: ${money(invoice.sgst)}`, { align: 'right' });
      doc.text(`IGST: ${money(invoice.igst)}`, { align: 'right' });
      doc.text(`Round Off: ${money(invoice.roundOff)}`, { align: 'right' });
      doc.fontSize(13).text(`Grand Total: ${money(invoice.grandTotal)}`, { align: 'right' });
      doc.fontSize(10).text(invoice.amountInWords);
      doc.image(qr, 40, doc.y + 10, { width: 80 });
      
      if (company?.signatureUrl) {
        doc.text('Authorized Signatory', 400, doc.y, { align: 'right' });
      }
    }

    doc.end();
  });
}
