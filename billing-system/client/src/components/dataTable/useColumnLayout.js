import { useCallback, useMemo, useState } from 'react';

/**
 * Column order, widths, and where the sticky ones stop.
 *
 * Kept out of the table component because all three are the same kind of thing
 * — a user's arrangement of the columns — and because a page that wants to
 * remember an arrangement between visits needs somewhere to read it from and
 * write it back to. `onOrderChange` and `onWidthChange` are the seam for that;
 * nothing here persists anything on its own.
 */

const DEFAULT_WIDTH = 140;
const MIN_WIDTH = 60;

/** "160px" → 160. Falls back to a sane default for %, auto, or nothing. */
function parseWidth(value, fallback = DEFAULT_WIDTH) {
  if (typeof value === 'number') return value;
  const match = String(value ?? '').match(/^(\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : fallback;
}

function useColumnLayout({
  columns,
  reorderable = false,
  resizable = false,
  onOrderChange,
  onWidthChange,
} = {}) {
  const [order, setOrder] = useState(null);
  const [widths, setWidths] = useState({});
  const [dragging, setDragging] = useState(null);

  /**
   * Columns in the user's order.
   *
   * A stored order can go stale — a column removed from the code, or a new one
   * added — so it is applied as a preference rather than as the list itself:
   * known ids first in the remembered order, then anything the order has never
   * heard of. A new column appears at the end instead of disappearing.
   */
  const ordered = useMemo(() => {
    if (!order) return columns;
    const byId = new Map(columns.map((column) => [column.id, column]));
    const known = order.map((id) => byId.get(id)).filter(Boolean);
    const rest = columns.filter((column) => !order.includes(column.id));
    return [...known, ...rest];
  }, [columns, order]);

  const widthOf = useCallback(
    (column) => widths[column.id] ?? parseWidth(column.width, null) ?? null,
    [widths],
  );

  // ── Reordering ───────────────────────────────────────────────────
  const startDrag = useCallback((columnId) => {
    if (reorderable) setDragging(columnId);
  }, [reorderable]);

  const dropOn = useCallback((targetId) => {
    if (!reorderable || !dragging || dragging === targetId) {
      setDragging(null);
      return;
    }

    const ids = ordered.map((column) => column.id);
    const from = ids.indexOf(dragging);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) { setDragging(null); return; }

    ids.splice(to, 0, ...ids.splice(from, 1));
    setOrder(ids);
    setDragging(null);
    onOrderChange?.(ids);
  }, [reorderable, dragging, ordered, onOrderChange]);

  // ── Resizing ─────────────────────────────────────────────────────
  /**
   * Drag the right edge of a heading.
   *
   * Listeners go on the document rather than the handle: the pointer routinely
   * leaves a 6px grip mid-drag, and a handler bound to the grip would drop the
   * resize the moment it did.
   */
  const startResize = useCallback((event, column) => {
    if (!resizable) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = widths[column.id]
      ?? parseWidth(column.width, event.target.closest('th')?.offsetWidth || DEFAULT_WIDTH);

    const onMove = (moveEvent) => {
      const next = Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX));
      setWidths((current) => ({ ...current, [column.id]: next }));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      setWidths((current) => {
        onWidthChange?.(column.id, current[column.id]);
        return current;
      });
    };

    // Without this, dragging across the header selects the heading text.
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [resizable, widths, onWidthChange]);

  const resetLayout = useCallback(() => {
    setOrder(null);
    setWidths({});
  }, []);

  return {
    columns: ordered,
    widthOf,
    dragging,
    startDrag,
    dropOn,
    endDrag: useCallback(() => setDragging(null), []),
    startResize,
    resetLayout,
    hasCustomLayout: Boolean(order) || Object.keys(widths).length > 0,
  };
}

/**
 * Left offsets for the columns pinned to the left edge.
 *
 * Each pinned cell has to know the total width of everything pinned before it,
 * because `position: sticky` needs an absolute `left` — a cell that guesses
 * sits on top of its neighbour. The leading control columns are pinned first
 * and have fixed widths, so they come through as a running total.
 */
function stickyOffsets({ leadingWidths = [], columns = [], widthOf }) {
  const offsets = { leading: [], columns: {} };

  let cursor = 0;
  for (const width of leadingWidths) {
    offsets.leading.push(cursor);
    cursor += width;
  }

  for (const column of columns) {
    if (!column.sticky) continue;
    offsets.columns[column.id] = cursor;
    // A sticky column without an explicit width cannot be measured before it
    // renders, so it contributes a default rather than nothing — an offset that
    // is a little wrong still stacks; one that is zero overlaps.
    cursor += widthOf?.(column) ?? parseWidth(column.width);
  }

  return offsets;
}

export default useColumnLayout;
