import ExcelJS from 'exceljs';

/**
 * Writes rows to a worksheet that looks like a report rather than a data dump:
 * bold frozen headings, sensible widths, right-aligned numbers with thousands
 * separators, and a totals row for the numeric columns.
 *
 * Callers pass rows already keyed by the heading they want, so the column
 * titles read as English rather than as database columns.
 */
export async function exportWorkbook(name, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing System';
  workbook.created = new Date();

  const title = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const sheet = workbook.addWorksheet(`${title} report`);

  const plainRows = rows.map((row) => (row.toJSON ? row.toJSON() : row));
  const keys = Object.keys(plainRows[0] || { Message: 'No records for this period' });

  sheet.columns = keys.map((key) => ({
    header: key,
    key,
    width: Math.min(Math.max(key.length + 6, 14), 40),
  }));

  plainRows.forEach((row) => sheet.addRow(row));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: keys.length } };

  // A column is numeric when every value in it is; only those get formatted
  // and totalled, so an HSN code or a phone number is left alone.
  const numericKeys = keys.filter((key) => plainRows.length
    && plainRows.every((row) => typeof row[key] === 'number'));

  for (const key of numericKeys) {
    const column = sheet.getColumn(key);
    column.numFmt = '#,##0.00';
    column.alignment = { horizontal: 'right' };
  }

  if (plainRows.length && numericKeys.length) {
    const totals = { [keys[0]]: 'Total' };
    for (const key of numericKeys) {
      totals[key] = plainRows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
    }
    const totalRow = sheet.addRow(totals);
    totalRow.font = { bold: true };
    totalRow.border = { top: { style: 'thin' } };
  }

  return workbook.xlsx.writeBuffer();
}
