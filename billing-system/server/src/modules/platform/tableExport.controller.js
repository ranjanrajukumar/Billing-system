import { exportWorkbook } from './excel.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

/**
 * Turns any table on screen into a formatted spreadsheet.
 *
 * The client sends the headings and the rendered cell text rather than a
 * resource name, which is a deliberate trade. A resource-driven export — the
 * server re-running the query and shaping it — would need a loader written per
 * table, and there are forty-six of them; more to the point, the two would
 * drift, and an export that disagrees with the screen it came from is worse
 * than no export. This way the file always says exactly what the user was
 * looking at, including the formatting the columns applied: "₹7,326.00" rather
 * than 7326, "48.89 KG" rather than 48890.
 *
 * The workbook itself is the same one the reports use — bold frozen headings,
 * sized columns, thousands separators and a totals row on numeric columns — so
 * an exported table looks like the rest of the system's output.
 */
export const exportTable = asyncHandler(async (req, res) => {
  const { name = 'table', columns = [], rows = [] } = req.body || {};

  if (!Array.isArray(columns) || columns.length === 0) {
    return res.status(400).json({ message: 'Provide the column headings to export' });
  }
  if (!Array.isArray(rows)) {
    return res.status(400).json({ message: 'Rows must be an array' });
  }

  // A guard rather than a limit anybody will meet: a table export is what a
  // person reads, and a request carrying a million rows is a mistake upstream.
  const MAX_ROWS = 50_000;
  if (rows.length > MAX_ROWS) {
    return res.status(413).json({ message: `Too many rows to export in one file (limit ${MAX_ROWS})` });
  }

  // Rows arrive as arrays positioned against the headings; the workbook helper
  // wants objects keyed by heading, so the two are zipped here.
  const headings = columns.map((column) => String(column));
  const keyed = rows.map((row) => {
    const record = {};
    headings.forEach((heading, index) => {
      const value = Array.isArray(row) ? row[index] : row?.[heading];
      // Numeric-looking text becomes a number so Excel can total and sort it,
      // but only when the whole cell is a number — "₹7,326.00" stays text
      // rather than silently losing its currency.
      const text = value === null || value === undefined ? '' : String(value);
      const asNumber = text.trim() === '' ? null : Number(text);
      record[heading] = asNumber !== null && Number.isFinite(asNumber) && text.trim() !== '' ? asNumber : text;
    });
    return record;
  });

  const safeName = String(name).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'table';
  const buffer = await exportWorkbook(safeName, keyed);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
  );
  return res.send(buffer);
});
