import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePaginated } from '@/lib/pagination';
import { useImpersonationHistoryQuery } from '@/features/impersonation/api';
import type { ImpersonationLog } from '@/types/api';
import styles from './impersonation.module.css';

/** ISO → "YYYY-MM-DD HH:mm" (UTC, mono-friendly). */
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

/** Seconds → compact "1h 02m" / "12m 30s" / "45s"; "—" while still open. */
function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Super-Admin impersonation audit report (FR-016). Keyset DataTable of who acted as
 * whom, when, and for how long; date-range filters. Open sessions show an ACTIVE badge;
 * durations populate once closed (TASK-002 H1 sweep closes abandoned logs).
 */
export function ImpersonationHistory() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const baseArg = useMemo(() => ({ limit: 25, from: from || undefined, to: to || undefined }), [from, to]);
  const { items, hasMore, isFetching, loadMore } = usePaginated(useImpersonationHistoryQuery, baseArg);

  const columns: Column<ImpersonationLog>[] = [
    { key: 'admin', header: 'Admin', render: (l) => l.adminEmail },
    { key: 'target', header: 'Target', render: (l) => l.targetEmail },
    {
      key: 'started',
      header: 'Started',
      render: (l) => <span className="u-mono">{formatDateTime(l.startedAt)}</span>,
    },
    {
      key: 'ended',
      header: 'Ended',
      render: (l) =>
        l.endedAt ? (
          <span className="u-mono">{formatDateTime(l.endedAt)}</span>
        ) : (
          <StatusBadge tone="pending">ACTIVE</StatusBadge>
        ),
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'end',
      render: (l) => <span className="u-mono">{formatDuration(l.durationSec)}</span>,
    },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headTitles}>
          <p className="u-label">Super Admin</p>
          <h1>Impersonation log</h1>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.filter}>
          <label htmlFor="imp-from" className="u-label">
            From
          </label>
          <input id="imp-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className={styles.filter}>
          <label htmlFor="imp-to" className="u-label">
            To
          </label>
          <input id="imp-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <DataTable
        caption="Impersonation history"
        columns={columns}
        rows={items}
        getRowId={(l) => l.id}
        isLoading={isFetching}
        hasMore={hasMore}
        onLoadMore={loadMore}
        emptyState={
          <EmptyState
            icon={<History size={28} aria-hidden="true" />}
            title="No impersonation events"
            description="When a super admin acts as another user, it’s logged here."
          />
        }
      />
    </main>
  );
}
