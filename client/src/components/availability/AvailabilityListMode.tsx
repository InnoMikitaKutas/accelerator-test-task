import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { EmptyState } from '@/components/ui/EmptyState';
import { cx } from '@/lib/cx';
import { toMinutes } from '@/lib/slots';
import type { TimeSlot } from '@/types/api';
import styles from './availability.module.css';

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface AvailabilityListModeProps {
  slots: TimeSlot[];
  /** Indices (into `slots`) that strictly overlap — flashed `--foul`. */
  flagged?: number[];
  onAdd: (slot: TimeSlot) => void;
  onRemove: (index: number) => void;
}

/**
 * The accessible, screen-reader-primary path for editing availability (FR-030/039):
 * an explicit slot list with remove buttons + an Add-slot form (day · start · end).
 * The grid is the pointer/sighted surface over the same working copy.
 */
export function AvailabilityListMode({ slots, flagged = [], onAdd, onRemove }: AvailabilityListModeProps) {
  const [day, setDay] = useState(1);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const invalid = toMinutes(end) <= toMinutes(start);
  const flaggedSet = new Set(flagged);

  const submit = () => {
    if (invalid) return;
    onAdd({ dayOfWeek: day, startTime: start, endTime: end });
  };

  return (
    <div className={styles.listMode}>
      {slots.length === 0 ? (
        <EmptyState title="No times set" description="Add a slot below to set availability." />
      ) : (
        <ul className={styles.slotList}>
          {slots.map((s, i) => (
            <li
              key={`${s.dayOfWeek}-${s.startTime}-${s.endTime}-${i}`}
              className={cx(styles.slotItem, flaggedSet.has(i) && styles.slotFlagged)}
            >
              <span className={styles.slotDay}>{DAY_LONG[s.dayOfWeek]}</span>
              <span className="u-mono">
                {s.startTime}–{s.endTime}
              </span>
              {flaggedSet.has(i) ? <span className={styles.slotWarn}>overlaps</span> : null}
              <button
                type="button"
                className={styles.slotRemove}
                aria-label={`Remove ${DAY_LONG[s.dayOfWeek]} ${s.startTime} to ${s.endTime}`}
                onClick={() => onRemove(i)}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addRow}>
        <FormField label="Day">
          {({ id }) => (
            <select id={id} value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {DAY_LONG.map((d, idx) => (
                <option key={d} value={idx}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Start">
          {({ id }) => <input id={id} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}
        </FormField>
        <FormField label="End" error={invalid ? 'End must be after start' : undefined}>
          {({ id, describedBy, invalid: inv }) => (
            <input
              id={id}
              type="time"
              value={end}
              aria-describedby={describedBy}
              aria-invalid={inv || undefined}
              onChange={(e) => setEnd(e.target.value)}
            />
          )}
        </FormField>
        <Button type="button" size="sm" onClick={submit} disabled={invalid}>
          <Plus size={15} aria-hidden="true" /> Add slot
        </Button>
      </div>
    </div>
  );
}
