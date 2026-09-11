// window.print() sends the whole application shell to the printer — sidebar,
// buttons, pagination and all. These helpers render only the document into an
// off-screen iframe, so the printer receives just the data.

function mountFrame() {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, {
    position: 'fixed', right: '0', bottom: '0',
    width: '0', height: '0', border: '0',
  });
  document.body.appendChild(frame);
  return frame;
}

function triggerPrint(frame, onDone) {
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    onDone?.();
    frame.remove();
  };

  const win = frame.contentWindow;
  win.addEventListener('afterprint', cleanup, { once: true });
  win.focus();
  win.print();
  // Not every browser fires afterprint for embedded PDFs, so sweep up later.
  setTimeout(cleanup, 60000);
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);

const PRINT_STYLES = `
  @page { margin: 22mm 16mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .print-header { border-bottom: 2px solid #111; margin-bottom: 14px; padding-bottom: 8px; }
  .print-header__brand { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
  .print-header__logo { width: 46px; height: 46px; object-fit: contain; }
  .print-header__company { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
  .print-header__details, .subtitle { color: #444; margin: 0; font-size: 11px; }
  .subtitle { margin-top: 4px; }
  .print-header--centered { text-align: center; border-bottom: 0; padding-bottom: 12px; margin-bottom: 16px; position: relative; }
  .print-header--centered::after { content: ''; position: absolute; height: 2px; left: 22%; right: 22%; bottom: 0; background: #1f2937; }
  .print-header--centered .print-header__brand { flex-direction: row; gap: 9px; justify-content: center; margin-bottom: 6px; }
  .print-header--centered .print-header__logo { width: 42px; height: 42px; }
  .print-header--centered .print-header__company { font-size: 17px; letter-spacing: 0.2px; margin: 0; }
  .print-header--centered .print-header__details { max-width: 560px; margin: 0 auto 9px; line-height: 1.45; }
  .print-header--centered h1 { font-size: 14px; letter-spacing: 1.4px; text-transform: uppercase; margin: 0; }
  .print-header--centered .subtitle { display: inline-block; margin-top: 7px; padding: 4px 10px; border-radius: 12px; background: #f1f5f9; color: #334155; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
  th { background: #eee; font-weight: bold; }
  tbody tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .numeric { text-align: right; }
  .summary { margin-top: 16px; width: 260px; margin-left: auto; }
  .summary div { display: flex; justify-content: space-between; padding: 3px 0; }
  .summary .total { border-top: 1px solid #000; margin-top: 4px; padding-top: 6px; font-weight: bold; }
  .empty { color: #666; font-style: italic; }
  .print-footer { position: fixed; left: 0; right: 0; bottom: -12mm; border-top: 1px solid #94a3b8; color: #475569; display: flex; justify-content: center; text-align: center; font-size: 9px; letter-spacing: 0.1px; padding-top: 4px; }
`;

/**
 * Print a server-generated PDF without navigating away from the app.
 */
export function printPdfBlob(blob) {
  const url = URL.createObjectURL(blob);
  const frame = mountFrame();
  frame.onload = () => triggerPrint(frame, () => URL.revokeObjectURL(url));
  frame.src = url;
}

/**
 * Print a ready-made HTML document (e.g. a designed invoice layout).
 */
export function printHtml(html) {
  const frame = mountFrame();
  frame.onload = () => triggerPrint(frame);
  frame.srcdoc = html;
}

/**
 * Print tabular data as a plain document.
 * `columns` are `{ header, value(row), numeric? }`; `summary` is `{ label, value, total? }`.
 * `header` and `footer` make a paper report identifiable after it has been
 * separated from the application.
 */
export function printDocument({ title, subtitle = '', columns = [], rows = [], summary = [], header = {}, footer = '' }) {
  const head = columns
    .map((column) => `<th${column.numeric ? ' class="numeric"' : ''}>${escapeHtml(column.header)}</th>`)
    .join('');

  const body = rows.length
    ? rows.map((row) => `<tr>${columns
        .map((column) => `<td${column.numeric ? ' class="numeric"' : ''}>${escapeHtml(column.value(row))}</td>`)
        .join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${columns.length}">No records</td></tr>`;

  const summaryHtml = summary.length
    ? `<div class="summary">${summary
        .map((line) => `<div${line.total ? ' class="total"' : ''}><span>${escapeHtml(line.label)}</span><span>${escapeHtml(line.value)}</span></div>`)
        .join('')}</div>`
    : '';

  const headerHtml = `<header class="print-header${header.centered ? ' print-header--centered' : ''}">
    ${(header.logoUrl || header.companyName) ? `<div class="print-header__brand">
      ${header.logoUrl ? `<img class="print-header__logo" src="${escapeHtml(header.logoUrl)}" alt="Company logo" />` : ''}
      ${header.companyName ? `<div class="print-header__company">${escapeHtml(header.companyName)}</div>` : ''}
    </div>` : ''}
    ${header.details ? `<div class="print-header__details">${escapeHtml(header.details)}</div>` : ''}
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
  </header>`;

  const frame = mountFrame();
  frame.onload = () => triggerPrint(frame);
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title><style>${PRINT_STYLES}</style></head>
<body>${headerHtml}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
${summaryHtml}
${footer ? `<footer class="print-footer"><span>${escapeHtml(footer)} · System-generated report</span></footer>` : ''}
</body></html>`;
}
