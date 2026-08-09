import { Company, InvoiceTemplate } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildInvoicePdf } from '../services/pdf.service.js';
import { defaultLayout, renderInvoiceHtml } from '../services/invoiceHtml.service.js';
import { documentTitle, toPrintableDocument } from '../services/documentAdapter.js';

// A stale company default must not take document output down with it, so an
// unresolvable template falls back to the built-in layout.
async function resolveTemplate(requested, company) {
  const selected = requested || company?.defaultInvoiceTemplate || '';
  if (!String(selected).startsWith('template:')) return { template: selected || 'standard', missing: false };

  const id = String(selected).replace('template:', '');
  const saved = await InvoiceTemplate.findOne({ where: { id, detstatus: false, isActive: true } });
  if (!saved) return { template: 'standard', missing: Boolean(requested) };
  return { template: saved.toJSON(), missing: false };
}

/**
 * Builds `downloadPdf` and `html` handlers for a document type.
 * `load(req)` returns the record with its Customer and items included.
 */
export function documentOutputHandlers(kind, load) {
  const downloadPdf = asyncHandler(async (req, res) => {
    const record = await load(req);
    if (!record) return res.status(404).json({ message: 'Not found' });

    const company = await Company.unscoped().findOne();
    const { template, missing } = await resolveTemplate(req.query.template, company);
    if (missing) return res.status(404).json({ message: 'Invoice template not found' });

    const document = toPrintableDocument(kind, record, company?.state || process.env.COMPANY_STATE);
    const title = template?.invoiceTitle && kind === 'invoice' ? template.invoiceTitle : documentTitle(kind);
    const buffer = await buildInvoicePdf(document, company, template, title);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${document.invoiceNumber}.pdf"`);
    res.send(buffer);
  });

  const html = asyncHandler(async (req, res) => {
    const record = await load(req);
    if (!record) return res.status(404).json({ message: 'Not found' });

    const company = await Company.findOne();
    const { template, missing } = await resolveTemplate(req.query.template, company);
    if (missing) return res.status(404).json({ message: 'Invoice template not found' });

    const resolved = typeof template === 'object' ? { ...template } : {};
    if (!Array.isArray(resolved.designLayout) || !resolved.designLayout.length) {
      resolved.designLayout = defaultLayout(kind);
    }
    resolved.invoiceTitle = documentTitle(kind);

    const document = toPrintableDocument(kind, record, company?.state || process.env.COMPANY_STATE);
    res.type('html').send(await renderInvoiceHtml({
      invoice: document,
      company,
      template: resolved,
      mediaBase: `${req.protocol}://${req.get('host')}`,
    }));
  });

  return { downloadPdf, html };
}
