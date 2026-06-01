import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Button } from './Button';
import { Skeleton } from './Skeleton';
import styles from './DataTable.module.css';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

export interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  total?: number;
  busyRowIds?: ReadonlySet<string>;
  emptyState?: ReactNode;
  /** Trailing per-row actions cell (⋮ menu, etc.). */
  rowActions?: (row: T) => ReactNode;
}

/** Hairline data table: sticky header, tabular figures, row-busy, keyset "Load more",
 *  → card-stack under 960px (via data-label). */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  isLoading,
  hasMore,
  onLoadMore,
  total,
  busyRowIds,
  emptyState,
  rowActions,
}: DataTableProps<T>) {
  const showSkeleton = isLoading && rows.length === 0;
  const showEmpty = !isLoading && rows.length === 0;
  const colCount = columns.length + (rowActions ? 1 : 0);

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx(styles.th, c.align === 'end' && styles.end, 'u-label')}>
                {c.header}
              </th>
            ))}
            {rowActions ? (
              <th scope="col" className={cx(styles.th, styles.end)}>
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {showSkeleton
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className={styles.row}>
                  {Array.from({ length: colCount }).map((__, j) => (
                    <td key={`sk-${i}-${j}`} className={styles.td}>
                      <Skeleton width="70%" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => {
                const id = getRowId(row);
                const busy = busyRowIds?.has(id) ?? false;
                return (
                  <tr key={id} className={cx(styles.row, busy && styles.busy)} aria-busy={busy || undefined}>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        data-label={typeof c.header === 'string' ? c.header : undefined}
                        className={cx(styles.td, c.align === 'end' && styles.end, c.className)}
                      >
                        {c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}
                      </td>
                    ))}
                    {rowActions ? <td className={cx(styles.td, styles.end)}>{rowActions(row)}</td> : null}
                  </tr>
                );
              })}
        </tbody>
      </table>

      {showEmpty ? <div className={styles.emptyCell}>{emptyState ?? 'No results.'}</div> : null}

      {hasMore ? (
        <div className={styles.more}>
          {typeof total === 'number' ? (
            <span className={cx(styles.count, 'u-label')}>
              Showing {rows.length} of {total}
            </span>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={onLoadMore}
            loading={isLoading && rows.length > 0}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
