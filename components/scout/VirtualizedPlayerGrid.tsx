'use client';
import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode, Ref } from 'react';

/**
 * Lightweight windowing wrapper for large player result sets.
 *
 * Renders only the rows near the viewport instead of the entire filtered
 * list, avoiding the slow initial render / janky scroll seen with hundreds
 * of player cards. No external dependency required — swap in for a direct
 * `.map()` render wherever the full player grid is mounted.
 */
export function useVirtualizedRows<T>({
  items,
  rowHeight,
  overscan = 5,
}: {
  items: T[];
  rowHeight: number;
  overscan?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
    el.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );

  return {
    containerRef,
    visibleItems: items.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    topSpacerHeight: startIndex * rowHeight,
    bottomSpacerHeight: Math.max(0, (items.length - endIndex) * rowHeight),
    totalHeight: items.length * rowHeight,
  };
}

// ── Grid-aware wrapper ───────────────────────────────────────────────────────
//
// `useVirtualizedRows` windows a flat list of *rows*. The scout results grid
// is a responsive CSS grid (1 column on mobile, 2 at `sm`, 3 at `lg` —
// matching Tailwind's `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), so a
// "row" here is actually `columns` player cards. `VirtualizedPlayerGrid`
// buckets the flat item list into rows of the current column count, then
// windows *those* rows — only cards on/near screen are ever mounted, so
// scrolling away unmounts them instead of leaving them accumulated in the
// DOM (fixing the unbounded growth from the old append-only "infinite
// scroll").
//
// Why hand-rolled instead of react-window/react-virtual: those libraries
// assume a single fixed column count you configure directly (FixedSizeGrid)
// — reproducing this layout's *responsive* column count (1/2/3 by
// breakpoint) means fighting the library's own sizing model as much as
// using it, for a ~5-7kB dependency this repo doesn't otherwise need. This
// file already had a working, tested single-column windowing primitive
// (`useVirtualizedRows`, added in a prior pass at this issue) — grouping
// items into responsive-width rows on top of it reuses that primitive
// as-is rather than introducing a second windowing implementation.

/**
 * Estimated height (px) of one grid row, including the `gap-6` (24px)
 * spacing below it. Fixed-row-height virtualization only needs this to be a
 * reasonable estimate — it sizes the top/bottom spacer elements that keep
 * scroll position and scrollbar proportions correct, not the cards
 * themselves (each card still lays out at its natural height). PlayerCard's
 * content (avatar, name, position/region line, two badges, progress bar,
 * "View Profile" button) is fairly uniform in height across players, so a
 * shared estimate — rather than per-row measurement — keeps the windowing
 * math O(1) per scroll event.
 */
export const PLAYER_GRID_ROW_HEIGHT = 316;

/** Tailwind breakpoints mirrored here: `sm` = 640px, `lg` = 1024px. */
const COLUMN_BREAKPOINTS: Array<{ minWidth: number; columns: number }> = [
  { minWidth: 1024, columns: 3 },
  { minWidth: 640, columns: 2 },
];

/**
 * Tracks how many grid columns are currently rendered, mirroring the
 * `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` breakpoints used elsewhere in
 * this codebase for the same player grid, so virtualized rows line up with
 * what CSS actually renders.
 */
function useResponsiveColumns(): number {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const queries = COLUMN_BREAKPOINTS.map(({ minWidth, columns: c }) => ({
      columns: c,
      mql: window.matchMedia(`(min-width: ${minWidth}px)`),
    }));

    const update = () => {
      const match = queries.find((q) => q.mql.matches);
      setColumns(match ? match.columns : 1);
    };
    update();

    queries.forEach(({ mql }) => mql.addEventListener('change', update));
    return () => {
      queries.forEach(({ mql }) => mql.removeEventListener('change', update));
    };
  }, []);

  return columns;
}

function chunkIntoRows<T>(items: T[], columns: number): T[][] {
  const size = Math.max(1, columns);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export interface VirtualizedPlayerGridHandle {
  /**
   * Scrolls so the item at `itemIndex` (0-based, into the flat item array
   * passed to `items`) is at the top of the viewport. Used by keyboard
   * pagination (`goToPage`/Previous/Next) to jump directly to a page
   * without requiring the user to scroll.
   */
  scrollToItemIndex: (itemIndex: number) => void;
}

export interface VirtualizedPlayerGridProps<T> {
  items: T[];
  /** Stable React key for an item, e.g. `(player) => player.id`. */
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  rowHeight?: number;
  overscan?: number;
  /** CSS height of the scrollable viewport. Default `'70vh'`. */
  height?: string;
  className?: string;
  'data-testid'?: string;
}

function VirtualizedPlayerGridInner<T>(
  {
    items,
    getKey,
    renderItem,
    rowHeight = PLAYER_GRID_ROW_HEIGHT,
    overscan = 2,
    height = '70vh',
    className,
    'data-testid': testId = 'player-grid',
  }: VirtualizedPlayerGridProps<T>,
  ref: Ref<VirtualizedPlayerGridHandle>,
) {
  const columns = useResponsiveColumns();
  const rows = useMemo(() => chunkIntoRows(items, columns), [items, columns]);

  const {
    containerRef,
    visibleItems: visibleRows,
    startIndex,
    topSpacerHeight,
    bottomSpacerHeight,
  } = useVirtualizedRows<T[]>({ items: rows, rowHeight, overscan });

  useImperativeHandle(
    ref,
    () => ({
      scrollToItemIndex(itemIndex: number) {
        const el = containerRef.current;
        if (!el) return;
        const rowIndex = Math.floor(itemIndex / Math.max(1, columns));
        el.scrollTop = rowIndex * rowHeight;
      },
    }),
    [columns, rowHeight, containerRef],
  );

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      className={`overflow-y-auto${className ? ` ${className}` : ''}`}
      style={{ height }}
    >
      <div style={{ height: topSpacerHeight }} aria-hidden="true" />
      {visibleRows.map((row, i) => (
        <div
          key={startIndex + i}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6"
        >
          {row.map((item) => (
            <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
          ))}
        </div>
      ))}
      <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
    </div>
  );
}

/**
 * Windowed, grid-aware player list: only cards on/near the visible viewport
 * are mounted. See the module-level comment above for why this hand-rolls
 * windowing on top of `useVirtualizedRows` instead of pulling in a
 * general-purpose grid-virtualization dependency.
 */
const VirtualizedPlayerGrid = forwardRef(VirtualizedPlayerGridInner) as <T>(
  props: VirtualizedPlayerGridProps<T> & {
    ref?: Ref<VirtualizedPlayerGridHandle>;
  },
) => ReactElement;

export default VirtualizedPlayerGrid;
