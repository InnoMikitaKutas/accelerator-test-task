import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cx } from '@/lib/cx';
import { usePaginated } from '@/lib/pagination';
import { useTrainerAvailabilityQuery, type TrainerAvailabilityArg } from '@/features/availability/api';
import type { TimeSlot, TrainerAvailabilityRow } from '@/types/api';
import styles from './availability.module.css';

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type HeatLevel = 0 | 1 | 2 | 3;

/** How many slots a player has on a given day. */
function daySlotCount(row: TrainerAvailabilityRow, day: number): number {
  return row.slots.reduce((n, s) => (s.dayOfWeek === day ? n + 1 : n), 0);
}

/** Per-player cell heat: 1/2/3+ slots → light/medium/strong (0 = empty). */
function playerLevel(count: number): HeatLevel {
  if (count <= 0) return 0;
  return Math.min(count, 3) as HeatLevel;
}

/** Aggregate-row heat: count relative to the busiest shown day. */
function densityLevel(count: number, max: number): HeatLevel {
  if (count <= 0) return 0;
  if (max <= 1) return 3;
  const r = count / max;
  if (r <= 1 / 3) return 1;
  if (r <= 2 / 3) return 2;
  return 3;
}

/** Human-readable slot list for the Best-Times chip title / SR text. */
function summarize(slots: TimeSlot[]): string {
  return slots
    .map((s) => `${DAY_SHORT[s.dayOfWeek] ?? '?'} ${s.startTime}–${s.endTime}`)
    .join(', ');
}

/**
 * TrainerAvailabilityView (FR-034) — Zone-3/org, read-only.
 *
 * A heatmap across the trainer's associated players: rows = players, columns =
 * day-of-week buckets (narrowed to a single day when filtered), and an aggregate
 * "Players free" density row whose cell intensity = how many players are available
 * per day. Filter by day + "available at/after" time. The time dimension is carried
 * by the filter + each row's Best-Times chip (vs. exploding the matrix into
 * day×time, which would be unreadable).
 *
 * Advisory only (BR-012). **L4:** the server excludes soft-deleted players and
 * applies the filters, so rows are rendered verbatim — no client-side filtering.
 */
export function TrainerAvailabilityView() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [day, setDay] = useState<number | ''>('');
  const [availableAt, setAvailableAt] = useState('');

  // Debounce free-text search → resets keyset accumulation when it settles.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const baseArg = useMemo<TrainerAvailabilityArg>(
    () => ({
      limit: 25,
      search: search || undefined,
      // `=== ''` (not `|| undefined`) so day 0 = Sunday is sent, not dropped.
      dayOfWeek: day === '' ? undefined : day,
      availableAt: availableAt || undefined,
    }),
    [search, day, availableAt],
  );

  const { items, hasMore, isFetching, loadMore } = usePaginated(useTrainerAvailabilityQuery, baseArg);

  // One day-column when filtered, else the full week.
  const shownDays = useMemo<number[]>(() => (day === '' ? [...DAYS] : [day]), [day]);

  // Aggregate "players free" per shown day — derived from the rows the API returned,
  // never re-filtered here (L4). This is the spec's across-players heat intensity.
  const perDayAvailable = useMemo(
    () => shownDays.map((d) => items.filter((r) => r.slots.some((s) => s.dayOfWeek === d)).length),
    [shownDays, items],
  );
  const maxAvailable = Math.max(1, ...perDayAvailable);

  const showSkeleton = isFetching && items.length === 0;
  const showEmpty = !isFetching && items.length === 0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headTitles}>
          <p className="u-label">Trainer</p>
          <h1>Best Times</h1>
        </div>
      </header>

      <p className={styles.advisory} role="note">
        Advisory only — a scheduling suggestion from players’ Best Times, not a booking or guarantee.
      </p>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <label htmlFor="bt-search" className="sr-only">
            Search players
          </label>
          <input
            id="bt-search"
            type="search"
            placeholder="Search players"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className={styles.filter}>
          <label htmlFor="bt-day" className="u-label">
            Day
          </label>
          <select
            id="bt-day"
            value={day === '' ? '' : String(day)}
            onChange={(e) => setDay(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">All days</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {DAY_LONG[d]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filter}>
          <label htmlFor="bt-at" className="u-label">
            Available at/after
          </label>
          <input id="bt-at" type="time" value={availableAt} onChange={(e) => setAvailableAt(e.target.value)} />
        </div>
      </div>

      {day !== '' || availableAt ? (
        <div className={styles.chips}>
          {day !== '' ? (
            <span className={styles.chip}>
              Day: {DAY_LONG[day]}
              <button type="button" className={styles.chipX} aria-label="Clear day filter" onClick={() => setDay('')}>
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ) : null}
          {availableAt ? (
            <span className={styles.chip}>
              At/after {availableAt}
              <button
                type="button"
                className={styles.chipX}
                aria-label="Clear time filter"
                onClick={() => setAvailableAt('')}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      {showEmpty ? (
        <EmptyState
          icon={<CalendarRange size={28} aria-hidden="true" />}
          title="No players match"
          description="No associated players have Best Times for these filters. Try clearing the day or time filter."
        />
      ) : (
        <>
          <div className={styles.heatWrap}>
            <table className={styles.heat}>
              <caption className="sr-only">
                Player Best-Times availability by day of week. Each cell shows how many time slots a player
                has that day; the “Players free” row shows how many players are available per day.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={cx(styles.corner, 'u-label')}>
                    Player
                  </th>
                  {shownDays.map((d) => (
                    <th key={d} scope="col" className={cx(styles.dayHead, 'u-label')}>
                      <abbr className={styles.abbr} title={DAY_LONG[d]}>
                        {DAY_SHORT[d]}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {showSkeleton
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`sk-${i}`}>
                        <th scope="row" className={styles.playerCell}>
                          <Skeleton width="60%" />
                        </th>
                        {shownDays.map((d) => (
                          <td key={d} className={styles.cell}>
                            <Skeleton width="40%" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : null}

                {!showSkeleton && items.length > 0 ? (
                  <tr className={styles.aggRow}>
                    <th scope="row" className={cx(styles.aggLabel, styles.playerCell)}>
                      <span className="u-label">Players free</span>
                    </th>
                    {shownDays.map((d, i) => {
                      const n = perDayAvailable[i];
                      const lvl = densityLevel(n, maxAvailable);
                      return (
                        <td key={d} className={cx(styles.cell, styles.aggCell, styles[`lvl${lvl}`])}>
                          <span className="u-mono" aria-hidden="true">
                            {n}
                          </span>
                          <span className="sr-only">
                            {n} player{n === 1 ? '' : 's'} free on {DAY_LONG[d]}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ) : null}

                {!showSkeleton
                  ? items.map((row) => {
                      const total = row.slots.length;
                      const title = total ? summarize(row.slots) : 'No times set';
                      return (
                        <tr key={row.playerProfileId} className={styles.row}>
                          <th scope="row" className={styles.playerCell}>
                            <span className={styles.playerInner}>
                              <span className={styles.playerName}>{row.displayName}</span>
                              <span
                                className={cx(styles.btChip, total === 0 && styles.btChipEmpty)}
                                title={title}
                              >
                                {total === 0 ? 'No times set' : `${total} slot${total === 1 ? '' : 's'}`}
                              </span>
                            </span>
                          </th>
                          {shownDays.map((d) => {
                            const c = daySlotCount(row, d);
                            const lvl = playerLevel(c);
                            return (
                              <td
                                key={d}
                                className={cx(styles.cell, styles[`lvl${lvl}`])}
                                title={c ? `${row.displayName}: ${c} slot${c === 1 ? '' : 's'} ${DAY_LONG[d]}` : undefined}
                              >
                                {c > 0 ? (
                                  <>
                                    <span className="u-mono" aria-hidden="true">
                                      {c}
                                    </span>
                                    <span className="sr-only">
                                      {row.displayName} available {DAY_LONG[d]}, {c} slot{c === 1 ? '' : 's'}
                                    </span>
                                  </>
                                ) : (
                                  <span className="sr-only">
                                    {row.displayName} not available {DAY_LONG[d]}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  : null}
              </tbody>
            </table>
          </div>

          {hasMore ? (
            <div className={styles.more}>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadMore}
                loading={isFetching && items.length > 0}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
