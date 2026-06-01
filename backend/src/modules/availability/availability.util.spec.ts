import { hhmm, validateSlots } from './availability.util';
import { AppException } from '@shared/common/errors/app.exception';

describe('validateSlots', () => {
  it('accepts non-overlapping, well-ordered slots', () => {
    expect(() =>
      validateSlots([
        { dayOfWeek: 1, startTime: '09:00', endTime: '11:00' },
        { dayOfWeek: 1, startTime: '13:00', endTime: '15:00' },
        { dayOfWeek: 2, startTime: '08:00', endTime: '09:00' },
      ]),
    ).not.toThrow();
  });

  it('rejects start >= end', () => {
    expect(() => validateSlots([{ dayOfWeek: 1, startTime: '11:00', endTime: '11:00' }])).toThrow(
      AppException,
    );
  });

  it('rejects overlapping slots on the same day', () => {
    expect(() =>
      validateSlots([
        { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
        { dayOfWeek: 1, startTime: '11:00', endTime: '13:00' },
      ]),
    ).toThrow(AppException);
  });

  it('allows the same time window on different days', () => {
    expect(() =>
      validateSlots([
        { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
        { dayOfWeek: 2, startTime: '09:00', endTime: '10:00' },
      ]),
    ).not.toThrow();
  });

  it('hhmm trims HH:MM:SS → HH:mm', () => {
    expect(hhmm('09:30:00')).toBe('09:30');
  });
});
