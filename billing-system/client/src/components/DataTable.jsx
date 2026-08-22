import { useMemo, useState } from 'react';
import {
  alpha, Box, Checkbox, Chip, IconButton, InputAdornment, MenuItem, Paper, Select,
  Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ClearIcon from '@mui/icons-material/Clear';
import EditIcon from '@mui/icons-material/Edit';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import InboxIcon from '@mui/icons-material/Inbox';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import LastPageIcon from '@mui/icons-material/LastPage';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { normalizeColumns, optionsFromData } from './dataTable/columns.js';
import { nodeToString } from './dataTable/useDataTable.js';
import { useDebouncedInput } from './dataTable/useDebouncedInput.js';

// Zentory's base type size, 13px. Everything inside the table is this size;
// the chrome around it — breadcrumb, tabs — is one step up at 14px.
const TEXT_SIZE = '0.8125rem';

/**
 * The application's table.
 *
 * Structured to match the Zentory web application's DataTable so the two
 * products read the same way: a toolbar above, a sticky header, an optional
 * per-column filter row beneath it, leading columns for selection and row
 * actions, then the data; loading, empty and error states inside the frame
 * rather than replacing it.
 *
 * Built on MUI rather than ported line by line, because Zentory's version is
 * Radix and Tailwind and this application is neither — copying it verbatim
 * would mean importing a second design system to render one component. What
 * carries across is the structure, the behaviour and the vocabulary; what
 * changes is which primitives draw it.
 *
 * ── Two ways to use it ────────────────────────────────────────────
 *
 * Existing pages pass rows they have already fetched and paginated:
 *
 *     <DataTable columns={columns} rows={rows} meta={meta} />
 *
 * and gain sorting, the sticky header and the new states without any change.
 *
 * Pages wanting search, filters or selection drive it from the hook:
 *
 *     const table = useDataTable({ data, columns, rowKey });
 *     <DataTable {...table} searchable columnFilters selectable />
 *
 * The distinction matters for pagination: a page holding a server's page of
 * rows must not have them re-paginated underneath it, so `meta` switches the
 * footer to reporting the server's position rather than computing its own.
 */
export default function DataTable(props) {
  const {
    // Data — either raw rows, or the hook's output.
    columns: rawColumns = [],
    rows,
    pageData,
    data,
    rowKey = (row) => String(row?.id),

    // Server pagination (existing pages).
    meta,
    onPageChange,

    // Presentation.
    //
    // Zentory's table has no serial column — the row is identified by its own
    // number (order number, SKU), and a second counter beside it is noise. This
    // application's forty-six existing tables do show one and have always shown
    // one, so it stays on for them and off for tables built the new way, which
    // is what `showSerial` resolves to below.
    showSerial: showSerialProp,
    mobileKeyField,
    dense = false,
    maxHeight,
    // Stretch to whatever height the page has left, so a table of four rows
    // does not leave a band of empty page beneath it. The body then scrolls
    // inside the frame instead of the whole page scrolling, which also keeps
    // the toolbar and the headings in view on a long list.
    fill = false,
    stickyHeader = true,
    emptyMessage = 'No records found',

    // Opt-in behaviour.
    searchable = false,
    columnFilters: showColumnFilters = false,
    selectable = false,
    exportable = false,
    onRefresh,

    // Row interactions.
    onViewRow,
    onEdit,
    onRowClick,
    renderExpandedRow,
    rowQuickActions,

    // States.
    loading = false,
    error = null,

    // Hook-supplied (spread from useDataTable).
    filteredData,
    selectedRows: selectedFromHook,
    handleSelectRow,
    handleSelectAll,
    sortColumn: sortColumnFromHook,
    sortDirection: sortDirectionFromHook,
    handleSort: handleSortFromHook,
    currentPage: pageFromHook,
    totalPages: totalPagesFromHook,
    totalItems: totalItemsFromHook,
    itemsPerPage: itemsPerPageFromHook,
    handlePageChange: pageChangeFromHook,
    handleItemsPerPageChange,
    globalSearch: searchFromHook,
    setGlobalSearch,
    columnFilters: filterValues,
    setColumnFilter,
    hasActiveFilters,
    clearAllFilters,

    itemsPerPageOptions = [10, 25, 50, 100],
  } = props;

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expanded, setExpanded] = useState([]);

  const columns = useMemo(() => normalizeColumns(rawColumns), [rawColumns]);

  // Rows to draw. The hook supplies `pageData`; existing pages supply `rows`.
  const visibleRows = pageData ?? rows ?? data ?? [];
  const hookDriven = pageData !== undefined;

  const showSerial = showSerialProp ?? !hookDriven;

  // ── Sorting ──────────────────────────────────────────────────────
  // Uncontrolled when a page has not opted into the hook, so a plain
  // `<DataTable columns rows />` still sorts. The sort applies to the rows the
  // page handed over, which on a server-paginated screen is this page of them —
  // stated in the header tooltip rather than pretended otherwise.
  const [localSort, setLocalSort] = useState({ column: '', direction: 'asc' });
  const sortColumn = hookDriven ? sortColumnFromHook : localSort.column;
  const sortDirection = hookDriven ? sortDirectionFromHook : localSort.direction;

  const handleSort = hookDriven ? handleSortFromHook : (columnId) => {
    setLocalSort((current) => {
      if (current.column !== columnId) return { column: columnId, direction: 'asc' };
      if (current.direction === 'asc') return { column: columnId, direction: 'desc' };
      return { column: '', direction: 'asc' };
    });
  };

  const sortedRows = useMemo(() => {
    if (hookDriven || !sortColumn) return visibleRows;
    const column = columns.find((candidate) => candidate.id === sortColumn);
    if (!column) return visibleRows;

    const direction = sortDirection === 'desc' ? -1 : 1;
    return [...visibleRows].sort((left, right) => {
      const a = column.sortValue ? column.sortValue(left) : nodeToString(column.accessor(left));
      const b = column.sortValue ? column.sortValue(right) : nodeToString(column.accessor(right));
      const aNum = Number(String(a).replace(/[^0-9.-]/g, ''));
      const bNum = Number(String(b).replace(/[^0-9.-]/g, ''));
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && String(a).match(/\d/) && String(b).match(/\d/)) {
        return (aNum - bNum) * direction;
      }
      return String(a).localeCompare(String(b), undefined, { numeric: true }) * direction;
    });
  }, [hookDriven, visibleRows, sortColumn, sortDirection, columns]);

  // ── Selection ────────────────────────────────────────────────────
  const selectedRows = selectedFromHook ?? [];
  const pageKeys = sortedRows.map(rowKey);
  const allPageSelected = pageKeys.length > 0 && pageKeys.every((key) => selectedRows.includes(key));

  // ── Leading columns ──────────────────────────────────────────────
  const showExpand = Boolean(renderExpandedRow);
  const leadingCount = (selectable ? 1 : 0) + (showExpand ? 1 : 0)
    + (onViewRow ? 1 : 0) + (onEdit ? 1 : 0) + (rowQuickActions ? 1 : 0) + (showSerial ? 1 : 0);
  const columnSpan = columns.length + leadingCount;

  // ── Serial numbers ───────────────────────────────────────────────
  const serialOffset = meta?.page && meta?.limit
    ? (Number(meta.page) - 1) * Number(meta.limit)
    : ((pageFromHook ?? 1) - 1) * (itemsPerPageFromHook ?? 0);
  const serialFor = (index) => serialOffset + index + 1;

  const toggleExpanded = (key) => setExpanded((current) => (
    current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
  ));

  // ── Mobile: stacked cards ────────────────────────────────────────
  // A sixteen-column table on a phone is unreadable however it is styled, so
  // small screens get one card per row instead of a horizontal scroll.
  if (isMobile) {
    return (
      <MobileCards
        columns={columns}
        rows={sortedRows}
        rowKey={rowKey}
        mobileKeyField={mobileKeyField}
        showSerial={showSerial}
        serialFor={serialFor}
        loading={loading}
        error={error}
        emptyMessage={emptyMessage}
        onRowClick={onRowClick ?? onViewRow}
      />
    );
  }

  // Zentory's cells: px-3 py-2 at 13px, and px-2 py-1.5 when compact. Matched
  // exactly rather than approximated — cell padding is the measurement a table
  // is judged on, because it sets the row height and so how much of a list fits
  // on a screen.
  const cellPadding = dense
    ? { py: 0.75, px: 1, fontSize: TEXT_SIZE }
    : { py: 1, px: 1.5, fontSize: TEXT_SIZE };

  // 13px medium for data, 13px semibold and muted for headings. The app's theme
  // makes every table heading uppercase 12px bold with wide letter-spacing;
  // these override it for this table only, leaving the handful of screens that
  // still build their own <Table> untouched.
  //
  // Wrapped in `&&` to double the selector's specificity. The theme states its
  // rule as a descendant — `& .MuiTableCell-head` — which is two classes deep
  // and so beats a plain sx declaration; the headings stayed uppercase until
  // this matched it.
  const headCellSx = {
    ...cellPadding,
    '&&': {
      fontSize: TEXT_SIZE,
      fontWeight: 600,
      textTransform: 'none',
      letterSpacing: 'normal',
      color: 'text.secondary',
      whiteSpace: 'nowrap',
    },
  };

  const bodyCellSx = {
    ...cellPadding,
    fontWeight: 500,
    color: 'text.primary',
    whiteSpace: 'nowrap',
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 1,
        overflow: 'hidden',
        border: `1px solid ${theme.palette.divider}`,
        ...(fill ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : null),
      }}
    >
      {(searchable || onRefresh || exportable || hasActiveFilters || hookDriven) && (
        <Toolbar
          searchable={searchable}
          globalSearch={searchFromHook ?? ''}
          setGlobalSearch={setGlobalSearch}
          hasActiveFilters={hasActiveFilters}
          clearAllFilters={clearAllFilters}
          onRefresh={onRefresh}
          exportable={exportable}
          columns={columns}
          rows={filteredData ?? sortedRows}
          loading={loading}
          shown={sortedRows.length}
          total={hookDriven ? totalItemsFromHook : (meta?.total ?? undefined)}
          currentPage={hookDriven ? pageFromHook : Number(meta?.page || 1)}
          totalPages={hookDriven ? totalPagesFromHook : Number(meta?.pages || 0)}
          onPageChange={hookDriven ? pageChangeFromHook : onPageChange}
          itemsPerPage={itemsPerPageFromHook}
          onItemsPerPageChange={handleItemsPerPageChange}
          itemsPerPageOptions={itemsPerPageOptions}
        />
      )}

      <TableContainer
        sx={{
          maxHeight: maxHeight || undefined,
          overflowX: 'auto',
          ...(fill ? { flex: 1, minHeight: 0 } : null),
        }}
      >
        <Table size="small" stickyHeader={stickyHeader && Boolean(maxHeight)} sx={{ minWidth: 480 }}>
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox" sx={{ width: 44 }}>
                  <Checkbox
                    size="small"
                    checked={allPageSelected}
                    indeterminate={!allPageSelected && pageKeys.some((key) => selectedRows.includes(key))}
                    onChange={() => handleSelectAll?.()}
                    inputProps={{ 'aria-label': 'Select all rows on this page' }}
                  />
                </TableCell>
              )}
              {showExpand && <TableCell sx={{ width: 44 }} />}
              {onViewRow && <TableCell sx={{ width: 44 }} />}
              {onEdit && <TableCell sx={{ width: 44 }} />}
              {rowQuickActions && <TableCell sx={{ width: 44 }} />}
              {showSerial && (
                <TableCell sx={{ ...headCellSx, width: 56 }}>S.No.</TableCell>
              )}

              {columns.map((column) => {
                const active = sortColumn === column.id;
                return (
                  <TableCell
                    key={column.id}
                    align={column.align}
                    sx={{
                      ...headCellSx,
                      width: column.width || undefined,
                      minWidth: column.minWidth || undefined,
                      cursor: column.sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      '&:hover .sort-arrow': { opacity: column.sortable ? 0.45 : 0 },
                    }}
                    onClick={column.sortable ? () => handleSort(column.id) : undefined}
                  >
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      {column.header}
                      {column.sortable && (
                        <Box
                          className="sort-arrow"
                          component="span"
                          sx={{
                            display: 'inline-flex',
                            opacity: active ? 1 : 0,
                            transition: 'opacity 120ms',
                            color: active ? 'primary.main' : 'text.disabled',
                          }}
                        >
                          {active && sortDirection === 'desc'
                            ? <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                            : <ArrowUpwardIcon sx={{ fontSize: 14 }} />}
                        </Box>
                      )}
                    </Box>
                  </TableCell>
                );
              })}
            </TableRow>

            {showColumnFilters && setColumnFilter && (
              <FilterRow
                columns={columns}
                leadingCount={leadingCount}
                values={filterValues ?? {}}
                onChange={setColumnFilter}
                rows={filteredData ?? sortedRows}
              />
            )}
          </TableHead>

          <TableBody sx={loading && sortedRows.length > 0 ? { opacity: 0.55, pointerEvents: 'none' } : undefined}>
            {loading && sortedRows.length === 0 && (
              <SkeletonRows columnSpan={columnSpan} />
            )}

            {!loading && error && (
              <StateRow
                columnSpan={columnSpan}
                icon={<ErrorOutlineIcon sx={{ fontSize: 40, opacity: 0.4, color: 'error.main' }} />}
                title={typeof error === 'string' ? error : 'Something went wrong loading this table'}
              />
            )}

            {!error && sortedRows.map((row, index) => {
              const key = rowKey(row) ?? index;
              const isExpanded = expanded.includes(key);
              const isSelected = selectedRows.includes(key);

              return [
                <TableRow
                  key={key}
                  hover
                  selected={isSelected}
                  className="animate-fadeInUp"
                  sx={{
                    animationDelay: `${Math.min(index, 12) * 0.03}s`,
                    cursor: onRowClick ? 'pointer' : 'default',
                    '&:last-child td': { border: 0 },
                  }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={isSelected}
                        onChange={() => handleSelectRow?.(key)}
                        inputProps={{ 'aria-label': `Select row ${index + 1}` }}
                      />
                    </TableCell>
                  )}
                  {showExpand && (
                    <TableCell sx={{ ...cellPadding }} onClick={(event) => event.stopPropagation()}>
                      <IconButton size="small" onClick={() => toggleExpanded(key)} aria-label={isExpanded ? 'Collapse row' : 'Expand row'}>
                        {isExpanded ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                  )}
                  {/* Round icon buttons at the start of the row, matching
                      Zentory: the eye tints toward the brand colour on hover,
                      the pencil stays neutral. Leading rather than trailing so
                      the two actions a user reaches for are always in the same
                      place, whatever the table is wide with. */}
                  {onViewRow && (
                    <TableCell sx={{ px: 0.5, py: 0 }} onClick={(event) => event.stopPropagation()}>
                      <Tooltip title="View details">
                        <IconButton
                          size="small"
                          onClick={() => onViewRow(row)}
                          aria-label="View row details"
                          sx={{
                            width: 32, height: 32, color: 'text.secondary',
                            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' },
                          }}
                        >
                          <VisibilityIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                  {onEdit && (
                    <TableCell sx={{ px: 0.5, py: 0 }} onClick={(event) => event.stopPropagation()}>
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => onEdit(row)}
                          aria-label="Edit row"
                          sx={{
                            width: 32, height: 32, color: 'text.secondary',
                            '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                          }}
                        >
                          <EditIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                  {rowQuickActions && (
                    <TableCell sx={{ ...cellPadding }} onClick={(event) => event.stopPropagation()}>
                      {rowQuickActions(row)}
                    </TableCell>
                  )}
                  {showSerial && (
                    <TableCell sx={{ ...bodyCellSx, color: 'text.secondary' }}>
                      {serialFor(index)}
                    </TableCell>
                  )}

                  {columns.map((column) => {
                    const content = column.accessor(row);
                    const cell = (
                      <TableCell
                        key={column.id}
                        align={column.align}
                        sx={bodyCellSx}
                      >
                        {content ?? '-'}
                      </TableCell>
                    );
                    if (!column.tooltip) return cell;
                    const title = column.tooltip(row);
                    return title ? <Tooltip key={column.id} title={title}>{cell}</Tooltip> : cell;
                  })}
                </TableRow>,

                showExpand && isExpanded ? (
                  <TableRow key={`${key}-expanded`}>
                    <TableCell colSpan={columnSpan} sx={{ bgcolor: alpha(theme.palette.action.hover, 0.4), py: 1.5 }}>
                      {renderExpandedRow(row)}
                    </TableCell>
                  </TableRow>
                ) : null,
              ];
            })}

            {!loading && !error && sortedRows.length === 0 && (
              <StateRow
                columnSpan={columnSpan}
                icon={<InboxIcon sx={{ fontSize: 40, opacity: 0.3 }} />}
                title={emptyMessage}
                hint={hasActiveFilters ? 'Try clearing the filters above.' : null}
              />
            )}
          </TableBody>
        </Table>
      </TableContainer>

    </Paper>
  );
}

/**
 * Everything above the table: search on the left, then the controls that say
 * where you are and move you — export, refresh, the item count, the page size
 * and the pager.
 *
 * The pager lives here rather than under the table because on a screen showing
 * ten of five hundred rows the controls that change what you are looking at
 * should be reachable without scrolling past the rows first.
 */
function Toolbar({
  searchable, globalSearch, setGlobalSearch, hasActiveFilters, clearAllFilters,
  onRefresh, exportable, columns, rows, loading,
  shown, total, currentPage, totalPages, onPageChange,
  itemsPerPage, onItemsPerPageChange, itemsPerPageOptions,
}) {
  const theme = useTheme();

  const exportCsv = () => {
    const visible = columns.filter((column) => column.searchable !== false);
    const header = visible.map((column) => `"${String(column.header).replace(/"/g, '""')}"`).join(',');
    const body = rows.map((row) => visible
      .map((column) => `"${nodeToString(column.accessor(row)).replace(/"/g, '""')}"`)
      .join(',')).join('\n');

    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      {searchable && setGlobalSearch && (
        <SearchBox value={globalSearch} onChange={setGlobalSearch} />
      )}

      {hasActiveFilters && clearAllFilters && (
        <Chip
          size="small"
          label="Clear filters"
          onDelete={clearAllFilters}
          deleteIcon={<ClearIcon />}
          onClick={clearAllFilters}
          color="primary"
          variant="outlined"
        />
      )}

      <Box sx={{ flex: 1 }} />

      {exportable && (
        <Box
          component="button"
          type="button"
          onClick={exportCsv}
          disabled={loading}
          sx={{
            ...toolbarBox, px: 1.25, py: 0.4, gap: 0.6, cursor: 'pointer',
            font: 'inherit', color: 'text.primary',
            '&:hover': { bgcolor: 'action.hover' },
            '&:disabled': { opacity: 0.5, cursor: 'default' },
          }}
        >
          <FileDownloadIcon sx={{ fontSize: 15, color: 'primary.main' }} />
          <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>Export</Typography>
        </Box>
      )}

      {onRefresh && (
        <Tooltip title="Refresh">
          <span>
            <IconButton
              size="small" onClick={onRefresh} disabled={loading} aria-label="Refresh table"
              sx={{ color: 'primary.main' }}
            >
              <RefreshIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </span>
        </Tooltip>
      )}

      {total !== undefined && <ItemsCounter shown={shown} total={total} />}

      {onItemsPerPageChange && (
        <Select
          size="small"
          value={itemsPerPage}
          onChange={(event) => onItemsPerPageChange(Number(event.target.value))}
          aria-label="Rows per page"
          sx={{ fontSize: '0.78rem', fontWeight: 600, height: 30, '& .MuiSelect-select': { py: 0.4 } }}
        >
          {itemsPerPageOptions.map((option) => (
            <MenuItem key={option} value={option} sx={{ fontSize: '0.8rem' }}>{option}</MenuItem>
          ))}
        </Select>
      )}

      {totalPages > 0 && onPageChange && (
        <Pager currentPage={currentPage} totalPages={totalPages} onChange={onPageChange} />
      )}
    </Box>
  );
}

/** A bordered pill, the shape every control in Zentory's toolbar shares. */
const toolbarBox = {
  display: 'flex', alignItems: 'center',
  border: '1px solid', borderColor: 'divider', borderRadius: 0.75,
  bgcolor: 'background.paper',
};

/**
 * "10 / 532 Items" — how many rows are on screen against how many exist.
 *
 * Two numbers rather than a range, because on a filtered table the useful
 * question is "how much of the whole am I looking at", not "which slice".
 */
function ItemsCounter({ shown, total }) {
  return (
    <Box sx={{ ...toolbarBox, px: 1.25, py: 0.4, gap: 0.5 }} aria-label={`Showing ${shown} of ${total} items`}>
      <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 800, color: 'primary.main' }}>
        {shown}
      </Typography>
      <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
        / {total}
      </Typography>
      <Box sx={{ ml: 0.5, px: 0.75, py: 0.1, borderRadius: 1, bgcolor: 'action.hover' }}>
        <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary' }}>
          Items
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * Page controls, with the page number typeable.
 *
 * On fifty-four pages the only way to reach page 40 otherwise is to click next
 * thirty-nine times, so the number is an input rather than a label.
 */
function Pager({ currentPage, totalPages, onChange }) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const target = parseInt(draft, 10);
    if (!Number.isNaN(target) && target >= 1 && target <= totalPages) onChange(target);
    setDraft('');
  };

  const step = (delta) => onChange(Math.min(Math.max(currentPage + delta, 1), totalPages));

  return (
    <Box component="nav" aria-label="Table pagination" sx={{ ...toolbarBox, px: 0.5, py: 0.25, gap: 0.25 }}>
      <IconButton size="small" disabled={currentPage <= 1} onClick={() => onChange(1)} aria-label="First page" sx={{ p: 0.35 }}>
        <FirstPageIcon sx={{ fontSize: 15 }} />
      </IconButton>
      <IconButton size="small" disabled={currentPage <= 1} onClick={() => step(-1)} aria-label="Previous page" sx={{ p: 0.35 }}>
        <NavigateBeforeIcon sx={{ fontSize: 15 }} />
      </IconButton>

      <Box
        component="input"
        type="text"
        inputMode="numeric"
        value={draft !== '' ? draft : String(currentPage)}
        aria-label={`Current page, ${currentPage} of ${totalPages}`}
        onFocus={(event) => { setDraft(String(currentPage)); event.target.select(); }}
        onChange={(event) => { if (/^\d*$/.test(event.target.value)) setDraft(event.target.value); }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { commit(); event.target.blur(); }
          if (event.key === 'Escape') { setDraft(''); event.target.blur(); }
        }}
        sx={{
          mx: 0.5, textAlign: 'center', border: 'none', outline: 'none',
          bgcolor: 'transparent', color: 'primary.main',
          font: 'inherit', fontSize: '0.78rem', fontWeight: 800,
          width: `${Math.max(String(totalPages).length, 2) + 1}ch`,
        }}
      />
      <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>/ {totalPages}</Typography>

      <IconButton size="small" disabled={currentPage >= totalPages} onClick={() => step(1)} aria-label="Next page" sx={{ p: 0.35 }}>
        <NavigateNextIcon sx={{ fontSize: 15 }} />
      </IconButton>
      <IconButton size="small" disabled={currentPage >= totalPages} onClick={() => onChange(totalPages)} aria-label="Last page" sx={{ p: 0.35 }}>
        <LastPageIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Box>
  );
}

/**
 * The toolbar's search box.
 *
 * A bordered strip with the magnifier inside it rather than a full form field,
 * which is what makes it read as part of the table's chrome instead of as a
 * form control that happens to sit above it. Debounced, so typing stays instant
 * on a few thousand rows.
 */
function SearchBox({ value, onChange }) {
  const [text, setText] = useDebouncedInput(value, onChange, 300);

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 220,
        px: 1, py: 0.4, borderRadius: 0.75,
        border: '1px solid', borderColor: 'divider',
        transition: 'border-color 120ms',
        '&:focus-within': { borderColor: 'primary.main' },
      }}
    >
      <SearchIcon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />
      <Box
        component="input"
        value={text}
        placeholder="Search"
        onChange={(event) => setText(event.target.value)}
        aria-label="Search this table"
        sx={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none',
          bgcolor: 'transparent', color: 'text.primary',
          font: 'inherit', fontSize: '0.82rem',
          '&::placeholder': { color: 'text.secondary', opacity: 1 },
        }}
      />
      {text && (
        <IconButton size="small" onClick={() => setText('')} aria-label="Clear search" sx={{ p: 0.25 }}>
          <ClearIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Box>
  );
}

/** A column's text filter — the same strip, sized for a header cell. */
function ColumnSearchInput({ value, onChange }) {
  const [text, setText] = useDebouncedInput(value, onChange, 300);

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.5,
        px: 0.75, py: 0.25, borderRadius: 0.5,
        border: '1px solid', borderColor: 'divider',
        '&:focus-within': { borderColor: 'primary.main' },
      }}
    >
      <Box
        component="input"
        value={text}
        // "All" rather than "Filter": the box describes what it is showing now,
        // not what it would do if used.
        placeholder="All"
        onChange={(event) => setText(event.target.value)}
        sx={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none',
          bgcolor: 'transparent', color: 'text.primary',
          font: 'inherit', fontSize: '0.75rem',
          '&::placeholder': { color: 'text.secondary', opacity: 1 },
        }}
      />
      <SearchIcon sx={{ fontSize: 13, color: 'text.secondary', flexShrink: 0 }} />
    </Box>
  );
}

/** One filter control per column, directly under the headers. */
function FilterRow({ columns, leadingCount, values, onChange, rows }) {
  return (
    <TableRow>
      {Array.from({ length: leadingCount }).map((_, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <TableCell key={`lead-${index}`} sx={{ py: 0.5 }} />
      ))}

      {columns.map((column) => {
        if (!column.filterable) return <TableCell key={column.id} sx={{ py: 0.5 }} />;
        const value = values[column.id] ?? '';

        if (column.filterType === 'DROPDOWN') {
          const options = column.filterOptions ?? optionsFromData(rows, column, nodeToString);
          return (
            <TableCell key={column.id} sx={{ py: 0.5 }}>
              <Select
                size="small"
                fullWidth
                displayEmpty
                value={value}
                onChange={(event) => onChange(column.id, event.target.value)}
                sx={{ fontSize: '0.78rem' }}
              >
                <MenuItem value="">All</MenuItem>
                {options.map((option) => (
                  <MenuItem key={option.value} value={option.value} sx={{ fontSize: '0.8rem' }}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </TableCell>
          );
        }

        // Number and date columns filter as a range, which is what people
        // actually want from them — "between 100 and 500", not "contains 1".
        if (column.filterType === 'NUMBER' || column.filterType === 'DATE') {
          const [from = '', to = ''] = String(value).split('|');
          const type = column.filterType === 'DATE' ? 'date' : 'number';
          const set = (nextFrom, nextTo) => onChange(
            column.id,
            !nextFrom && !nextTo ? '' : `${nextFrom}|${nextTo}`,
          );
          return (
            <TableCell key={column.id} sx={{ py: 0.5 }}>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <TextField
                  size="small" type={type} value={from} placeholder="From"
                  onChange={(event) => set(event.target.value, to)}
                  inputProps={{ style: { fontSize: '0.75rem' } }}
                />
                <TextField
                  size="small" type={type} value={to} placeholder="To"
                  onChange={(event) => set(from, event.target.value)}
                  inputProps={{ style: { fontSize: '0.75rem' } }}
                />
              </Box>
            </TableCell>
          );
        }

        return (
          <TableCell key={column.id} sx={{ py: 0.5 }}>
            <ColumnSearchInput value={value} onChange={(next) => onChange(column.id, next)} />
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/** Shimmer while the first load is in flight, so the frame does not jump. */
function SkeletonRows({ columnSpan, count = 5 }) {
  return Array.from({ length: count }).map((_, rowIndex) => (
    // eslint-disable-next-line react/no-array-index-key
    <TableRow key={`skeleton-${rowIndex}`}>
      {Array.from({ length: columnSpan }).map((__, cellIndex) => (
        // eslint-disable-next-line react/no-array-index-key
        <TableCell key={`skeleton-${rowIndex}-${cellIndex}`} sx={{ py: 1.1 }}>
          <Skeleton variant="text" width={cellIndex === 0 ? '40%' : '75%'} height={14} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

function StateRow({ columnSpan, icon, title, hint }) {
  return (
    <TableRow>
      <TableCell colSpan={columnSpan} sx={{ border: 0 }}>
        <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
          <Box sx={{ mb: 1 }}>{icon}</Box>
          <Typography variant="body2" color="text.secondary">{title}</Typography>
          {hint && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {hint}
            </Typography>
          )}
        </Box>
      </TableCell>
    </TableRow>
  );
}

/** One card per row, for screens too narrow to hold a table. */
function MobileCards({
  columns, rows, rowKey, mobileKeyField, showSerial, serialFor,
  loading, error, emptyMessage, onRowClick,
}) {
  const theme = useTheme();

  if (loading && rows.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={index} variant="rounded" height={92} />
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
        <ErrorOutlineIcon sx={{ fontSize: 44, opacity: 0.4, mb: 1, color: 'error.main' }} />
        <Typography variant="body2">{typeof error === 'string' ? error : 'Could not load this table'}</Typography>
      </Box>
    );
  }

  if (!rows.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
        <InboxIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
        <Typography variant="body2" color="text.secondary">{emptyMessage}</Typography>
      </Box>
    );
  }

  const actionsColumn = columns.find((column) => column.id === 'actions');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {rows.map((row, index) => (
        <Paper
          key={rowKey(row) ?? index}
          variant="outlined"
          className="animate-fadeInUp"
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          sx={{
            borderRadius: 2.5,
            overflow: 'hidden',
            animationDelay: `${Math.min(index, 12) * 0.04}s`,
            border: `1px solid ${theme.palette.divider}`,
            cursor: onRowClick ? 'pointer' : 'default',
          }}
        >
          {showSerial && (
            <CardRow label="S.No." value={serialFor(index)} theme={theme} />
          )}
          {columns
            .filter((column) => column.id !== 'actions')
            .map((column, columnIndex) => (
              <CardRow
                key={column.id}
                label={column.header}
                value={column.accessor(row)}
                highlight={column.id === mobileKeyField || columnIndex === 0}
                theme={theme}
              />
            ))}
          {actionsColumn && (
            <Box
              sx={{
                px: 2, py: 0.75, display: 'flex', justifyContent: 'flex-end',
                bgcolor: alpha(theme.palette.action.hover, 0.5),
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {actionsColumn.accessor(row)}
            </Box>
          )}
        </Paper>
      ))}
    </Box>
  );
}

function CardRow({ label, value, highlight = false, theme }) {
  return (
    <Box
      sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        px: 2, py: highlight ? 1.25 : 0.85,
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
        bgcolor: highlight ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'text.secondary', fontSize: '0.68rem', minWidth: 80, flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          textAlign: 'right', fontWeight: highlight ? 700 : 400,
          fontSize: highlight ? '0.9rem' : '0.875rem', maxWidth: '60%', wordBreak: 'break-word',
        }}
      >
        {value ?? '-'}
      </Box>
    </Box>
  );
}

export { useDataTable } from './dataTable/useDataTable.js';
export { normalizeColumns } from './dataTable/columns.js';
