import {
  activeTrainers,
  shouldHideChannelBar,
  firstChannelFor,
  isValidContext,
  resolveInitialContext,
} from './channel';
import type { Subject } from '@/types/api';

const subject = (profileId: string, trainers: Array<[string, 'active' | 'inactive']>): Subject => ({
  profileId,
  displayName: profileId,
  isSelf: false,
  isChild: true,
  trainers: trainers.map(([trainerId, status]) => ({ trainerId, name: trainerId, status })),
});

describe('channel logic', () => {
  it('hides the bar for a single subject with ≤1 active trainer', () => {
    expect(shouldHideChannelBar([])).toBe(true);
    expect(shouldHideChannelBar([subject('me', [['t1', 'active']])])).toBe(true);
    expect(shouldHideChannelBar([subject('me', [])])).toBe(true);
  });

  it('shows the bar for multiple trainers or multiple subjects', () => {
    expect(
      shouldHideChannelBar([
        subject('me', [
          ['t1', 'active'],
          ['t2', 'active'],
        ]),
      ]),
    ).toBe(false);
    expect(shouldHideChannelBar([subject('me', [['t1', 'active']]), subject('emma', [])])).toBe(false);
  });

  it('excludes inactive trainers from active channels', () => {
    const s = subject('emma', [
      ['t1', 'inactive'],
      ['t2', 'active'],
    ]);
    expect(activeTrainers(s).map((t) => t.trainerId)).toEqual(['t2']);
    expect(firstChannelFor(s)).toEqual({ subjectProfileId: 'emma', trainerId: 't2' });
  });

  it('firstChannelFor returns null when no active trainers', () => {
    expect(firstChannelFor(subject('emma', [['t1', 'inactive']]))).toBeNull();
  });

  it('validates a context against the available subjects/trainers', () => {
    const subjects = [subject('emma', [['t2', 'active']])];
    expect(isValidContext(subjects, { subjectProfileId: 'emma', trainerId: 't2' })).toBe(true);
    expect(isValidContext(subjects, { subjectProfileId: 'emma', trainerId: 'tX' })).toBe(false);
    expect(isValidContext(subjects, null)).toBe(false);
  });

  it('resolves the initial context: persisted → default → first', () => {
    const subjects = [
      subject('me', [['t1', 'active']]),
      subject('emma', [['t2', 'active']]),
    ];
    // persisted valid → used
    expect(
      resolveInitialContext(subjects, null, { subjectProfileId: 'emma', trainerId: 't2' }),
    ).toEqual({ subjectProfileId: 'emma', trainerId: 't2' });
    // persisted invalid → default
    expect(
      resolveInitialContext(subjects, { subjectProfileId: 'me', trainerId: 't1' }, {
        subjectProfileId: 'gone',
        trainerId: 'x',
      }),
    ).toEqual({ subjectProfileId: 'me', trainerId: 't1' });
    // neither → first channel
    expect(resolveInitialContext(subjects, null, null)).toEqual({
      subjectProfileId: 'me',
      trainerId: 't1',
    });
  });
});
