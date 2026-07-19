import ExcelJS from 'exceljs';

export async function exportWorkbook(name, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${name} report`);
  const plainRows = rows.map((row) => row.toJSON ? row.toJSON() : row);
  const keys = Object.keys(plainRows[0] || { message: '' });
  sheet.columns = keys.map((key) => ({ header: key, key, width: Math.max(key.length + 4, 16) }));
  plainRows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}
