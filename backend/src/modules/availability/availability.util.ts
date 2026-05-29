import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { TimeSlotDto } from './dto/availability.dto';

/** Validates start<end and rejects overlapping slots on the same day (HH:mm compares lexically). */
export function validateSlots(slots: TimeSlotDto[]): void {
  const byDay = new Map<number, { start: string; end: string }[]>();
  for (const s of slots) {
    if (s.startTime >= s.endTime) {
      throw new AppException(AppErrorCode.VALIDATION_ERROR, {
        details: [{ field: 'slots', message: `start must be before end (day ${s.dayOfWeek})` }],
      });
    }
    const arr = byDay.get(s.dayOfWeek) ?? [];
    arr.push({ start: s.startTime, end: s.endTime });
    byDay.set(s.dayOfWeek, arr);
  }
  for (const [day, arr] of byDay) {
    arr.sort((a, b) => (a.start < b.start ? -1 : 1));
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].start < arr[i - 1].end) {
        throw new AppException(AppErrorCode.VALIDATION_ERROR, {
          details: [{ field: 'slots', message: `overlapping slots on day ${day}` }],
        });
      }
    }
  }
}

/** DB time columns come back as 'HH:MM:SS'; the API uses 'HH:mm'. */
export const hhmm = (t: string): string => t.slice(0, 5);
