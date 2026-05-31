import { describe, expect, it } from 'vitest';
import type { TimeSlot } from '@/types/api';
import {
  toMinutes,
  toTime,
  normalizeSlots,
  serializeSlots,
  findOverlaps,
  hasOverlap,
  addRange,
  removeRange,
  toggleCell,
  isCellPainted,
} from './slots';

const slot = (dayOfWeek: number, startTime: string, endTime: string): TimeSlot => ({
  dayOfWeek,
  startTime,
  endTime,
});

describe('time helpers', () => {
  it('round-trips HH:mm ↔ minutes since midnight', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('23:59')).toBe(1439);
    expect(toTime(0)).toBe('00:00');
    expect(toTime(570)).toBe('09:30');
    expect(toTime(1439)).toBe('23:59');
  });
});

describe('normalizeSlots', () => {
  it('merges adjacent ranges on the same day', () => {
    expect(normalizeSlots([slot(1, '09:00', '10:00'), slot(1, '10:00', '11:00')])).toEqual([
      slot(1, '09:00', '11:00'),
    ]);
  });

  it('merges overlapping ranges on the same day', () => {
    expect(normalizeSlots([slot(1, '09:00', '10:30'), slot(1, '10:00', '11:00')])).toEqual([
      slot(1, '09:00', '11:00'),
    ]);
  });

  it('keeps different days separate and sorts by day then start', () => {
    expect(
      normalizeSlots([slot(3, '08:00', '09:00'), slot(1, '12:00', '13:00'), slot(1, '09:00', '10:00')]),
    ).toEqual([slot(1, '09:00', '10:00'), slot(1, '12:00', '13:00'), slot(3, '08:00', '09:00')]);
  });

  it('drops zero-length and inverted ranges', () => {
    expect(normalizeSlots([slot(2, '10:00', '10:00'), slot(2, '12:00', '11:00')])).toEqual([]);
  });
});

describe('overlap detection', () => {
  it('flags strict overlaps but not mere adjacency', () => {
    expect(hasOverlap([slot(1, '09:00', '10:00'), slot(1, '10:00', '11:00')])).toBe(false);
    expect(hasOverlap([slot(1, '09:00', '10:30'), slot(1, '10:00', '11:00')])).toBe(true);
  });

  it('returns the indices of every slot in a strict overlap', () => {
    expect(
      findOverlaps([slot(1, '09:00', '10:30'), slot(1, '10:00', '11:00'), slot(2, '09:00', '10:00')]),
    ).toEqual([0, 1]);
  });
});

describe('paint model', () => {
  it('addRange merges a painted range into existing coverage', () => {
    expect(addRange([slot(1, '09:00', '10:00')], 1, '10:00', '12:00')).toEqual([slot(1, '09:00', '12:00')]);
  });

  it('removeRange splits a slot that spans the removed window', () => {
    expect(removeRange([slot(1, '09:00', '12:00')], 1, '10:00', '11:00')).toEqual([
      slot(1, '09:00', '10:00'),
      slot(1, '11:00', '12:00'),
    ]);
  });

  it('removeRange leaves other days untouched', () => {
    expect(removeRange([slot(1, '09:00', '10:00'), slot(2, '09:00', '10:00')], 1, '09:00', '10:00')).toEqual([
      slot(2, '09:00', '10:00'),
    ]);
  });

  it('toggleCell paints an empty cell, then clears it', () => {
    const painted = toggleCell([], 1, '09:00', 60);
    expect(painted).toEqual([slot(1, '09:00', '10:00')]);
    expect(isCellPainted(painted, 1, '09:00', 60)).toBe(true);

    const cleared = toggleCell(painted, 1, '09:00', 60);
    expect(cleared).toEqual([]);
    expect(isCellPainted(cleared, 1, '09:00', 60)).toBe(false);
  });
});

describe('serializeSlots', () => {
  it('returns the normalized replacement set for the PUT body', () => {
    expect(serializeSlots([slot(1, '10:00', '11:00'), slot(1, '09:00', '10:00')])).toEqual([
      slot(1, '09:00', '11:00'),
    ]);
  });
});
