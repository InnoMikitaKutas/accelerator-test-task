import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import { useAppDispatch } from '@/app/hooks';
import { pushToast } from '@/features/toasts/toastsSlice';
import { parseApiError } from '@/services/apiError';
import { useGetAvailabilityQuery, useReplaceAvailabilityMutation } from '@/features/availability/api';
import {
  addRange,
  removeRange,
  toggleCell,
  isCellPainted,
  serializeSlots,
  findOverlaps,
  toTime,
} from '@/lib/slots';
import type { SubjectType, TimeSlot } from '@/types/api';
import { AvailabilityListMode } from './AvailabilityListMode';
import styles from './availability.module.css';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const START_HOUR = 6;
const END_HOUR = 22;
const STEP = 60;
const ROWS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i); // 06:00 … 21:00

const sameSet = (a: TimeSlot[], b: TimeSlot[]) =>
  JSON.stringify(serializeSlots(a)) === JSON.stringify(serializeSlots(b));

export interface WeeklyAvailabilityGridProps {
  subjectType: SubjectType;
  subjectId: string;
  /** Heading — e.g. "My Times" (coach) or a child's name (parent setting Best Times). */
  title?: string;
}

/**
 * WeeklyAvailabilityGrid (FR-030/039) — the "training board". A 7-day × hourly chalk
 * grid the owner paints (click, click-drag, or keyboard); Save replaces the full set
 * (`PUT`). Server-rejected overlaps surface a conflict banner + flash. The List view
 * is the screen-reader-primary path (see AvailabilityListMode); under ~760px the grid
 * scrolls horizontally and List is the recommended mode.
 *
 * Routing + the session-derived subject land in Phase 10.1; this component is driven
 * by explicit `subjectType`/`subjectId` props.
 */
export function WeeklyAvailabilityGrid({ subjectType, subjectId, title = 'Availability' }: WeeklyAvailabilityGridProps) {
  const dispatch = useAppDispatch();
  const { data, isLoading } = useGetAvailabilityQuery({ subjectType, subjectId });
  const [replace, { isLoading: saving }] = useReplaceAvailabilityMutation();

  const serverSlots = useMemo(() => data?.slots ?? [], [data]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [conflict, setConflict] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ day: 1, row: 0 });

  // Seed the working copy ONCE per subject, when its data first lands — a later
  // refetch (e.g. post-save invalidation) must not clobber in-progress edits.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${subjectType}:${subjectId}`;
    if (data && seededFor.current !== key) {
      seededFor.current = key;
      setSlots(data.slots);
    }
  }, [data, subjectType, subjectId]);

  const dirty = useMemo(() => !sameSet(slots, serverSlots), [slots, serverSlots]);
  const overlaps = useMemo(() => findOverlaps(slots), [slots]);

  const cellStartOf = (row: number) => toTime((START_HOUR + row) * 60);
  const cellEndOf = (row: number) => toTime((START_HOUR + row + 1) * 60);

  // ---- pointer paint: click toggles a cell; mouse-drag paints/erases a streak ----
  const drag = useRef<{ active: boolean; paint: boolean } | null>(null);
  useEffect(() => {
    const stop = () => {
      if (drag.current) drag.current.active = false;
    };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const onCellDown = (day: number, row: number) => {
    const start = cellStartOf(row);
    const painted = isCellPainted(slots, day, start, STEP);
    drag.current = { active: true, paint: !painted };
    setSlots((s) => (painted ? removeRange(s, day, start, cellEndOf(row)) : addRange(s, day, start, cellEndOf(row))));
    setCursor({ day, row });
    setConflict(null);
  };
  const onCellEnter = (day: number, row: number) => {
    if (!drag.current?.active) return;
    const start = cellStartOf(row);
    setSlots((s) =>
      drag.current!.paint ? addRange(s, day, start, cellEndOf(row)) : removeRange(s, day, start, cellEndOf(row)),
    );
  };

  // ---- keyboard: arrows move the cursor, Space/Enter toggles, Shift+Arrow extends ----
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusCell = (day: number, row: number) => cellRefs.current[`${day}:${row}`]?.focus();

  const onGridKeyDown = (e: KeyboardEvent) => {
    let { day, row } = cursor;
    switch (e.key) {
      case 'ArrowRight':
        day = Math.min(6, day + 1);
        break;
      case 'ArrowLeft':
        day = Math.max(0, day - 1);
        break;
      case 'ArrowDown':
        row = Math.min(ROWS.length - 1, row + 1);
        break;
      case 'ArrowUp':
        row = Math.max(0, row - 1);
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        setSlots((s) => toggleCell(s, cursor.day, cellStartOf(cursor.row), STEP));
        setConflict(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (day === cursor.day && row === cursor.row) return;
    if (e.shiftKey) {
      setSlots((s) => addRange(s, day, cellStartOf(row), cellEndOf(row))); // extend onto the entered cell
      setConflict(null);
    }
    setCursor({ day, row });
    focusCell(day, row);
  };

  const onSave = async () => {
    try {
      const res = await replace({ subjectType, subjectId, slots: serializeSlots(slots) }).unwrap();
      setSlots(res.slots);
      setConflict(null);
      dispatch(pushToast({ tone: 'go', message: 'Availability saved.' }));
    } catch (err) {
      if (parseApiError(err).errorCode === 'VALIDATION_ERROR') {
        setConflict('Some times overlap and were rejected — adjust the highlighted slots and try again.');
      }
      // anything else surfaces via the global error handler
    }
  };

  const onAdd = (slot: TimeSlot) => {
    setSlots((s) => [...s, slot]); // raw append so overlaps can surface in the list
    setConflict(null);
  };
  const onRemove = (index: number) => {
    setSlots((s) => s.filter((_, i) => i !== index));
    setConflict(null);
  };

  const flagged = conflict ? (overlaps.length ? overlaps : slots.map((_, i) => i)) : overlaps;

  return (
    <section className={styles.gridPage} aria-busy={isLoading || undefined}>
      <header className={styles.header}>
        <div className={styles.headTitles}>
          <p className="u-label">Availability</p>
          <h1>{title}</h1>
        </div>
        <div className={styles.gridActions}>
          <div className={styles.viewToggle} role="group" aria-label="View mode">
            <button
              type="button"
              className={styles.viewBtn}
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              <LayoutGrid size={15} aria-hidden="true" /> Grid
            </button>
            <button
              type="button"
              className={styles.viewBtn}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <List size={15} aria-hidden="true" /> List
            </button>
          </div>
          <Button onClick={onSave} loading={saving} disabled={!dirty}>
            Save
          </Button>
        </div>
      </header>

      {conflict ? (
        <p className={styles.conflict} role="alert">
          {conflict}
        </p>
      ) : null}
      {!conflict && overlaps.length ? (
        <p className={styles.warnNote} role="status">
          Some slots overlap — they’ll be merged or rejected on save.
        </p>
      ) : null}

      {view === 'list' ? (
        <AvailabilityListMode slots={slots} flagged={flagged} onAdd={onAdd} onRemove={onRemove} />
      ) : (
        <div className={styles.gridWrap}>
          <div
            className={styles.grid}
            role="grid"
            aria-label={`${title} weekly availability. Arrow keys move, Space toggles, Shift+Arrow extends. The List view is recommended for screen readers.`}
            onKeyDown={onGridKeyDown}
          >
            <div className={styles.gridRow} role="row">
              <span className={cx(styles.timeHead, 'u-label')} role="columnheader">
                Time
              </span>
              {DAY_SHORT.map((d, i) => (
                <span key={d} className={cx(styles.gridHeadDay, 'u-label')} role="columnheader">
                  <abbr className={styles.abbr} title={DAY_LONG[i]}>
                    {d}
                  </abbr>
                </span>
              ))}
            </div>
            {ROWS.map((hour, row) => (
              <div key={hour} className={styles.gridRow} role="row">
                <span className={cx(styles.timeCell, 'u-mono')} role="rowheader">
                  {toTime(hour * 60)}
                </span>
                {DAY_SHORT.map((_, day) => {
                  const start = cellStartOf(row);
                  const painted = isCellPainted(slots, day, start, STEP);
                  const isCursor = cursor.day === day && cursor.row === row;
                  return (
                    <button
                      key={day}
                      type="button"
                      role="gridcell"
                      ref={(el) => {
                        cellRefs.current[`${day}:${row}`] = el;
                      }}
                      tabIndex={isCursor ? 0 : -1}
                      aria-pressed={painted}
                      aria-label={`${DAY_LONG[day]} ${start} to ${cellEndOf(row)}${painted ? ', available' : ''}`}
                      className={cx(styles.gridCell, painted && styles.painted)}
                      onMouseDown={() => onCellDown(day, row)}
                      onMouseEnter={() => onCellEnter(day, row)}
                      // Bail out when unchanged so a plain focus doesn't trigger a re-render.
                      onFocus={() => setCursor((c) => (c.day === day && c.row === row ? c : { day, row }))}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
