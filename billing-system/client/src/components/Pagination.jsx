import { TablePagination } from '@mui/material';

export default function Pagination({ meta, onChangePage, onChangeLimit }) {
  return (
    <TablePagination
      component="div"
      count={meta?.total || 0}
      page={(meta?.page || 1) - 1}
      rowsPerPage={meta?.limit || 10}
      onPageChange={(_event, page) => onChangePage(page + 1)}
      onRowsPerPageChange={(event) => onChangeLimit(Number(event.target.value))}
    />
  );
}
