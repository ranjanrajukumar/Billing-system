/**
 * One column shape, from two column vocabularies.
 *
 * This project's forty-six existing tables describe a column as
 * `{ field, headerName, render }`. The Zentory table describes it as
 * `{ id, header, accessor }` and adds sorting, searching and filtering
 * metadata on top.
 *
 * Rewriting forty-six pages to change three key names would be a large,
 * entirely mechanical diff with a real chance of typos in pages nobody opens
 * often — and it would have to land in one commit to avoid a half-converted
 * codebase. Accepting both instead means every existing table gains the new
 * structure without being touched, and a page adopting sorting or filters opts
 * in by adding the fields it wants, when somebody is already working on it.
 *
 * The old names are not deprecated. They are a valid shorthand: `field` and
 * `headerName` are exactly `id` and `header` under different names.
 */

const identity = (value) => value;

/** A column's cell renderer, whichever vocabulary declared it. */
function accessorFor(column) {
  if (typeof column.accessor === 'function') return column.accessor;
  if (typeof column.render === 'function') return column.render;
  const key = column.id ?? column.field;
  return (row) => row?.[key] ?? '-';
}

function normalizeColumn(column) {
  const id = column.id ?? column.field;

  return {
    ...column,
    id,
    field: column.field ?? id,
    header: column.header ?? column.headerName ?? '',
    headerName: column.headerName ?? column.header ?? '',
    accessor: accessorFor(column),

    // Sorting and searching default on; a column opts out when its content is
    // not meaningfully orderable — an actions column, a checkbox, an icon.
    sortable: column.sortable !== false && !isActionColumn(column),
    searchable: column.searchable !== false && !isActionColumn(column),
    filterable: column.filterable !== false && !isActionColumn(column),
    filterType: column.filterType ?? 'SEARCH',
    filterOptions: normalizeFilterOptions(column.filterOptions),

    align: column.align ?? 'left',
    width: column.width ?? null,
    minWidth: column.minWidth ?? null,
    sticky: column.isStickyColumn ?? column.sticky ?? false,
    tooltip: column.tooltip ?? null,
    sortValue: column.sortValue ?? null,
    searchValue: column.searchValue ?? null,
  };
}

/**
 * Columns holding buttons rather than data.
 *
 * Detected by convention — `field: 'actions'` is what this codebase already
 * uses, and the mobile card view has always relied on it — so the forty-six
 * existing tables get sensible behaviour without declaring anything. Sorting a
 * column of Edit buttons is meaningless, and offering it invites the user to
 * try.
 */
function isActionColumn(column) {
  const id = String(column.id ?? column.field ?? '').toLowerCase();
  return id === 'actions' || id === 'action' || id === 'select' || column.isAction === true;
}

function normalizeFilterOptions(options) {
  if (!Array.isArray(options)) return null;
  return options.map((option) => (
    typeof option === 'string' ? { label: option, value: option } : option
  ));
}

export function normalizeColumns(columns = []) {
  return columns.filter(Boolean).map(normalizeColumn);
}

/**
 * Distinct values in a column, for a dropdown filter that offers only what is
 * actually there. A filter listing values that match nothing is worse than no
 * filter — the user concludes the table is broken rather than empty.
 */
export function optionsFromData(rows, column, nodeToString) {
  const values = new Set();
  for (const row of rows) {
    const text = column.searchValue
      ? String(column.searchValue(row))
      : nodeToString(column.accessor(row));
    const trimmed = text.trim();
    if (trimmed) values.add(trimmed);
  }
  return [...values].sort((a, b) => a.localeCompare(b)).map((value) => ({ label: value, value }));
}

export { identity };
