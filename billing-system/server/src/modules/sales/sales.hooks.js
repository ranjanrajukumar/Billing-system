import { provide, POINTS } from '../platform/extensions.service.js';
import { defaultLayout, renderInvoiceHtml } from './invoiceHtml.service.js';

/**
 * How a document is drawn.
 *
 * Every printable document in the system — quotation, challan, order, return —
 * is rendered by the invoice layout engine, which lives here because an invoice
 * is what it was built for. The shared rendering helper in platform used to
 * import it directly, which is platform depending on sales.
 *
 * Sales registers the renderer instead. `provide` rather than `on` because
 * there is exactly one right answer to "how is this drawn", not a collection of
 * opinions to gather.
 */
provide(POINTS.DOCUMENT_HTML, { defaultLayout, renderInvoiceHtml });
