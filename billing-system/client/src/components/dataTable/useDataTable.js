import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeColumns } from './columns.js';

/**
 * Sort, filter, paginate and select — held once, so pages stop repeating it.
 *
 * Ported from the Zentory web application's table so both products behave the
 * same way: the same sort cycle, the same filter grammar, the same search
 * semantics. A user who learns the table on one product already knows it on
 * the other, and a bug fixed in the behaviour is fixed in one place.
 *
 *   const table = useDataTable({ data, columns, rowKey });
 *   <DataTable {...table} />
 *
 * Everything here is client-side, which is the right default for a page that
 * already has its rows in hand. Server-paginated pages pass `meta` to DataTable
 * instead and this hook stays out of the way.
 */

/**
 * Flattens a rendered cell into text so it can be searched and sorted.
 *
 * Cells are React nodes — a Chip, a Stack of two Typographys, an icon and a
 * label. Searching the underlying row object instead would miss everything the
 * renderer composed, which is usually the part the user can actually see and is
 * therefore the part they type.
 */
export function nodeToString(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(nodeToString).join(' ');
  if (typeof node === 'object' && node.props) return nodeToString(node.props.children);
  return String(node);
}

const searchValueOf = (row, column) => (
  column.searchValue ? String(column.searchValue(row)) : nodeToString(column.accessor(row))
).toLowerCase();

const sortValueOf = (row, column) => (
  column.sortValue ? column.sortValue(row) : nodeToString(column.accessor(row)).toLowerCase()
);

/** "12.5" out of "₹12.50", so a number filter works on a formatted cell. */
function parseNumber(value) {
  const normalized = String(value).replace(/,/g, '').trim();
  if (!normalized) return null;
  const direct = Number(normalized);
  if (!Number.isNaN(direct)) return direct;
  const stripped = normalized.replace(/[^0-9.-]/g, '');
  if (!stripped) return null;
  const parsed = Number(stripped);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Range filters are stored as "from|to", either side optional. */
function parseRange(value) {
  const [fromRaw = '', toRaw = ''] = String(value).split('|');
  const from = fromRaw.trim() === '' ? undefined : Number(fromRaw);
  const to = toRaw.trim() === '' ? undefined : Number(toRaw);
  const hasFrom = from !== undefined && !Number.isNaN(from);
  const hasTo = to !== undefined && !Number.isNaN(to);
  if (!hasFrom && !hasTo) return null;
  return { from: hasFrom ? from : undefined, to: hasTo ? to : undefined };
}

function parseDateRange(value) {
  const [fromIso, toIso] = String(value).split('|');
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  const to = toIso ? new Date(toIso) : null;
  return { from, to: to && !Number.isNaN(to.getTime()) ? to : null };
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

/** Does one row survive one column's filter? */
function matchesColumnFilter(row, column, rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return true;

  const cellText = searchValueOf(row, column);

  if (column.filterType === 'NUMBER') {
    const range = parseRange(value);
    if (!range) return true;
    const cellNumber = parseNumber(cellText);
    if (cellNumber === null) return false;
    if (range.from !== undefined && cellNumber < range.from) return false;
    if (range.to !== undefined && cellNumber > range.to) return false;
    return true;
  }

  if (column.filterType === 'DATE') {
    const range = parseDateRange(value);
    if (!range) return true;
    const cellDate = new Date(column.sortValue ? column.sortValue(row) : cellText);
    if (Number.isNaN(cellDate.getTime())) return false;
    if (cellDate < startOfDay(range.from)) return false;
    if (range.to && cellDate > endOfDay(range.to)) return false;
    return true;
  }

  if (column.filterType === 'DROPDOWN') {
    // Exact match: a dropdown offers the values that exist, so a substring
    // match would let "Paid" also select "Partially Paid".
    return cellText === value.toLowerCase();
  }

  return cellText.includes(value.toLowerCase());
}

export function useDataTable({
  data = [],
  columns = [],
  rowKey = (row) => String(row?.id),
  defaultSort = null,
  defaultItemsPerPage = 10,
  globalSearchColumns = null,
} = {}) {
  const resolvedColumns = useMemo(() => normalizeColumns(columns), [columns]);

  const [selectedRows, setSelectedRows] = useState([]);
  const [sortColumn, setSortColumn] = useState(defaultSort?.column ?? '');
  const [sortDirection, setSortDirection] = useState(defaultSort?.direction ?? 'asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(defaultItemsPerPage);
  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState({});

  // A tab switch or a reload changes the row count under a user sitting on
  // page 4; leaving them there shows an empty table that looks like a failure.
  const previousLength = useRef(data.length);
  useEffect(() => {
    if (data.length !== previousLength.current) {
      setCurrentPage(1);
      previousLength.current = data.length;
    }
  }, [data.length]);

  const filteredData = useMemo(() => {
    let rows = [...data];

    const term = globalSearch.trim().toLowerCase();
    if (term) {
      const searchable = resolvedColumns.filter((column) => (
        column.searchable !== false
        && (!globalSearchColumns || globalSearchColumns.includes(column.id))
      ));
      rows = rows.filter((row) => searchable.some((column) => searchValueOf(row, column).includes(term)));
    }

    for (const [columnId, value] of Object.entries(columnFilters)) {
      const column = resolvedColumns.find((candidate) => candidate.id === columnId);
      if (!column) continue;
      rows = rows.filter((row) => matchesColumnFilter(row, column, value));
    }

    if (sortColumn) {
      const column = resolvedColumns.find((candidate) => candidate.id === sortColumn);
      if (column) {
        const direction = sortDirection === 'desc' ? -1 : 1;
        rows.sort((left, right) => {
          const a = sortValueOf(left, column);
          const b = sortValueOf(right, column);
          // Numbers compare as numbers: "10" must not sort before "9".
          if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
          const aNum = parseNumber(a);
          const bNum = parseNumber(b);
          if (aNum !== null && bNum !== null) return (aNum - bNum) * direction;
          return String(a).localeCompare(String(b), undefined, { numeric: true }) * direction;
        });
      }
    }

    return rows;
  }, [data, resolvedColumns, globalSearch, columnFilters, sortColumn, sortDirection, globalSearchColumns]);

  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);

  const pageData = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, safePage, itemsPerPage]);

  /**
   * Three-state cycle: ascending, then descending, then back to unsorted.
   *
   * The third state matters — without it there is no way back to the order the
   * server sent, which is usually newest-first and usually what the user wanted
   * before they experimented with a sort.
   */
  const handleSort = useCallback((columnId) => {
    if (sortColumn !== columnId) {
      setSortColumn(columnId);
      setSortDirection('asc');
      return;
    }
    if (sortDirection === 'asc') {
      setSortDirection('desc');
      return;
    }
    setSortColumn('');
    setSortDirection('asc');
  }, [sortColumn, sortDirection]);

  const handleSelectRow = useCallback((key) => {
    setSelectedRows((current) => (
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
    ));
  }, []);

  // Acts on the visible page only. "Select all" on a filtered view meaning
  // "including the rows you cannot see" is how people delete the wrong records.
  const handleSelectAll = useCallback(() => {
    const keys = pageData.map(rowKey);
    setSelectedRows((current) => (
      keys.every((key) => current.includes(key))
        ? current.filter((key) => !keys.includes(key))
        : [...new Set([...current, ...keys])]
    ));
  }, [pageData, rowKey]);

  const setColumnFilter = useCallback((columnId, value) => {
    setColumnFilters((current) => {
      const next = { ...current };
      if (!String(value ?? '').trim()) delete next[columnId];
      else next[columnId] = value;
      return next;
    });
    setCurrentPage(1);
  }, []);

  const clearAllFilters = useCallback(() => {
    setColumnFilters({});
    setGlobalSearch('');
    setCurrentPage(1);
  }, []);

  const hasActiveFilters = Boolean(globalSearch.trim()) || Object.keys(columnFilters).length > 0;

  return {
    pageData,
    filteredData,
    columns: resolvedColumns,
    rowKey,

    selectedRows,
    handleSelectRow,
    handleSelectAll,
    clearSelection: useCallback(() => setSelectedRows([]), []),

    sortColumn,
    sortDirection,
    handleSort,

    currentPage: safePage,
    totalPages,
    totalItems,
    itemsPerPage,
    handlePageChange: setCurrentPage,
    handleItemsPerPageChange: useCallback((count) => {
      setItemsPerPage(count);
      setCurrentPage(1);
    }, []),

    globalSearch,
    setGlobalSearch: useCallback((term) => {
      setGlobalSearch(term);
      setCurrentPage(1);
    }, []),
    columnFilters,
    setColumnFilter,
    clearAllFilters,
    hasActiveFilters,
  };
}

export default useDataTable;
