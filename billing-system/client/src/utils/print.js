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
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .subtitle { color: #444; margin: 0 0 16px; font-size: 12px; }
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
 */
export function printDocument({ title, subtitle = '', columns = [], rows = [], summary = [] }) {
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

  const frame = mountFrame();
  frame.onload = () => triggerPrint(frame);
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title><style>${PRINT_STYLES}</style></head>
<body><h1>${escapeHtml(title)}</h1>
${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
${summaryHtml}</body></html>`;
}
