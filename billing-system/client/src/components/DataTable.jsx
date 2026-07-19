import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

export default function DataTable({ columns, rows }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" sx={{ whiteSpace: 'nowrap' }}>
        <TableHead>
          <TableRow>{columns.map((column) => <TableCell key={column.field}>{column.headerName}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {rows?.map((row) => (
            <TableRow hover key={row.id}>
              {columns.map((column) => <TableCell key={column.field}>{column.render ? column.render(row) : row[column.field]}</TableCell>)}
            </TableRow>
          ))}
          {!rows?.length && (
            <TableRow><TableCell colSpan={columns.length}><Typography color="text.secondary">No records found</Typography></TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
