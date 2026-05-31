import type { TimeSlot } from '@/types/api';

/**
 * Pure weekly-availability slot model (Task 8.1). The WeeklyAvailabilityGrid and
 * the list-mode fallback are both views over these functions: they paint/merge/split
 * ranges in a local working copy, then `serializeSlots` produces the replacement set
 * sent to `PUT /availability/...` (replace semantics, SetAvailabilityDto.slots).
 *
 * A slot is a half-open range [startTime, endTime) on one `dayOfWeek` (0=Sun … 6=Sat),
 * times 'HH:mm' 24h. Adjacent ranges (endA === startB) MERGE; the server rejects
 * strictly-overlapping slots, which `findOverlaps` surfaces for inline feedback.
 */

interface Interval {
  start: number;
  end: number;
}

/** 'HH:mm' → minutes since midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes since midnight → 'HH:mm' (zero-padded). */
export function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function byDay(slots: TimeSlot[]): Map<number, Interval[]> {
  const map = new Map<number, Interval[]>();
  for (const s of slots) {
    const start = toMinutes(s.startTime);
    const end = toMinutes(s.endTime);
    if (end <= start) continue; // drop zero-length / inverted
    const arr = map.get(s.dayOfWeek) ?? [];
    arr.push({ start, end });
    map.set(s.dayOfWeek, arr);
  }
  return map;
}

/**
 * Canonical form: invalid ranges dropped, sorted by (day, start), and adjacent or
 * overlapping ranges on the same day merged into the minimal set.
 */
export function normalizeSlots(slots: TimeSlot[]): TimeSlot[] {
  const map = byDay(slots);
  const out: TimeSlot[] = [];
  for (const day of [...map.keys()].sort((a, b) => a - b)) {
    const intervals = map.get(day)!.sort((a, b) => a.start - b.start || a.end - b.end);
    let cur = { ...intervals[0] };
    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i];
      if (next.start <= cur.end) {
        cur.end = Math.max(cur.end, next.end); // overlap or adjacency → merge
      } else {
        out.push({ dayOfWeek: day, startTime: toTime(cur.start), endTime: toTime(cur.end) });
        cur = { ...next };
      }
    }
    out.push({ dayOfWeek: day, startTime: toTime(cur.start), endTime: toTime(cur.end) });
  }
  return out;
}

/** The PUT replacement set — normalized slots, ready for `{ slots }`. */
export function serializeSlots(slots: TimeSlot[]): TimeSlot[] {
  return normalizeSlots(slots);
}

/** Indices of every slot that strictly overlaps another on the same day (adjacency is OK). */
export function findOverlaps(slots: TimeSlot[]): number[] {
  const flagged = new Set<number>();
  const items = slots.map((s) => ({ day: s.dayOfWeek, start: toMinutes(s.startTime), end: toMinutes(s.endTime) }));
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (items[a].day !== items[b].day) continue;
      if (items[a].start < items[b].end && items[b].start < items[a].end) {
        flagged.add(a);
        flagged.add(b);
      }
    }
  }
  return [...flagged].sort((x, y) => x - y);
}

export function hasOverlap(slots: TimeSlot[]): boolean {
  return findOverlaps(slots).length > 0;
}

/** Add a painted range on a day and re-normalize (merges into existing coverage). */
export function addRange(slots: TimeSlot[], dayOfWeek: number, startTime: string, endTime: string): TimeSlot[] {
  return normalizeSlots([...slots, { dayOfWeek, startTime, endTime }]);
}

/** Remove/trim a range on a day, splitting any slot that spans it. */
export function removeRange(slots: TimeSlot[], dayOfWeek: number, startTime: string, endTime: string): TimeSlot[] {
  const rs = toMinutes(startTime);
  const re = toMinutes(endTime);
  const out: TimeSlot[] = [];
  for (const s of slots) {
    if (s.dayOfWeek !== dayOfWeek) {
      out.push(s);
      continue;
    }
    const ss = toMinutes(s.startTime);
    const se = toMinutes(s.endTime);
    if (re <= ss || rs >= se) {
      out.push(s); // disjoint from the removal window
      continue;
    }
    if (ss < rs) out.push({ dayOfWeek, startTime: toTime(ss), endTime: toTime(rs) }); // left remainder
    if (se > re) out.push({ dayOfWeek, startTime: toTime(re), endTime: toTime(se) }); // right remainder
  }
  return normalizeSlots(out);
}

/** Is the grid cell [cellStart, cellStart+step) fully covered on this day? */
export function isCellPainted(slots: TimeSlot[], dayOfWeek: number, cellStart: string, step: number): boolean {
  const cs = toMinutes(cellStart);
  const ce = cs + step;
  return slots.some((s) => s.dayOfWeek === dayOfWeek && toMinutes(s.startTime) <= cs && toMinutes(s.endTime) >= ce);
}

/** Toggle a single grid cell: paint it if empty, clear it if already covered. */
export function toggleCell(slots: TimeSlot[], dayOfWeek: number, cellStart: string, step: number): TimeSlot[] {
  const end = toTime(toMinutes(cellStart) + step);
  return isCellPainted(slots, dayOfWeek, cellStart, step)
    ? removeRange(slots, dayOfWeek, cellStart, end)
    : addRange(slots, dayOfWeek, cellStart, end);
}
