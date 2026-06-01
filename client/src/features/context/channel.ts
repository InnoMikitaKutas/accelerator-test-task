import type { ContextRef, Subject, TrainerChannel } from '@/types/api';

/** Pure logic behind the Channel Bar — kept out of the component for TDD. */

export const activeTrainers = (subject: Subject): TrainerChannel[] =>
  subject.trainers.filter((t) => t.status === 'active');

/** Hidden entirely when there's nothing to switch: ≤1 subject with ≤1 active trainer. */
export function shouldHideChannelBar(subjects: Subject[]): boolean {
  if (subjects.length === 0) return true;
  if (subjects.length === 1) return activeTrainers(subjects[0]).length <= 1;
  return false;
}

export function firstChannelFor(subject: Subject | undefined): ContextRef | null {
  if (!subject) return null;
  const trainer = activeTrainers(subject)[0];
  return trainer ? { subjectProfileId: subject.profileId, trainerId: trainer.trainerId } : null;
}

export function isValidContext(subjects: Subject[], ref: ContextRef | null | undefined): boolean {
  if (!ref) return false;
  const subject = subjects.find((s) => s.profileId === ref.subjectProfileId);
  return Boolean(subject && activeTrainers(subject).some((t) => t.trainerId === ref.trainerId));
}

/** On load, prefer the persisted context, then the server default, then the first channel. */
export function resolveInitialContext(
  subjects: Subject[],
  defaultContext: ContextRef | null,
  persisted: ContextRef | null,
): ContextRef | null {
  if (isValidContext(subjects, persisted)) return persisted;
  if (isValidContext(subjects, defaultContext)) return defaultContext;
  return firstChannelFor(subjects[0]);
}
