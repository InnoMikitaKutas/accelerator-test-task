import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { skipToken } from '@reduxjs/toolkit/query';
import { cx } from '@/lib/cx';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { markContextSynced, setContext } from '@/features/context/activeContextSlice';
import { useGetContextsQuery, useSetDefaultContextMutation } from '@/features/context/api';
import {
  activeTrainers,
  firstChannelFor,
  isValidContext,
  resolveInitialContext,
  shouldHideChannelBar,
} from '@/features/context/channel';
import type { Subject } from '@/types/api';
import styles from './ChannelBar.module.css';

/**
 * ⭐ The Channel Bar — names the exact (subject × trainer) channel you're tuned to,
 * and switches it. Renders only for PLAYER/parent with something to switch (FR-019/027).
 * Tuning re-tunes Zone-3, persists the default, and announces via aria-live.
 */
export function ChannelBar() {
  const dispatch = useAppDispatch();
  const role = useAppSelector((s) => s.session.user?.role);
  const active = useAppSelector((s) => s.activeContext.current);
  const { data } = useGetContextsQuery(role === 'PLAYER' ? undefined : skipToken);
  const [setDefault] = useSetDefaultContextMutation();

  const [announcement, setAnnouncement] = useState('');
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | undefined>(
    active?.subjectProfileId,
  );

  const subjects = useMemo(() => data?.subjects ?? [], [data?.subjects]);

  // Auto-tune on first load (or after a bounce) when there's no valid active context.
  useEffect(() => {
    if (subjects.length === 0) return;
    if (!isValidContext(subjects, active)) {
      const initial = resolveInitialContext(subjects, data?.defaultContext ?? null, active ?? null);
      if (initial) {
        dispatch(setContext(initial));
        dispatch(markContextSynced()); // came from server/persisted — no PUT owed
      }
    }
  }, [subjects, active, data?.defaultContext, dispatch]);

  // Keep the displayed subject aligned with the active context.
  useEffect(() => {
    if (active?.subjectProfileId) setSelectedSubjectId(active.subjectProfileId);
  }, [active?.subjectProfileId]);

  if (role !== 'PLAYER') return null;
  if (shouldHideChannelBar(subjects)) return null;

  const currentSubject =
    subjects.find((s) => s.profileId === selectedSubjectId) ?? subjects[0];
  const trainers = activeTrainers(currentSubject);

  const tune = (subject: Subject, trainerId: string) => {
    const ref = { subjectProfileId: subject.profileId, trainerId };
    dispatch(setContext(ref));
    void setDefault(ref); // persist the default (PUT /me/contexts/default)
    const trainerName = subject.trainers.find((t) => t.trainerId === trainerId)?.name ?? 'coach';
    setAnnouncement(`Now viewing ${subject.displayName} with ${trainerName}.`);
    setSubjectMenuOpen(false);
  };

  const selectSubject = (subject: Subject) => {
    setSelectedSubjectId(subject.profileId);
    setSubjectMenuOpen(false);
    const first = firstChannelFor(subject);
    if (first) tune(subject, first.trainerId);
  };

  const showSubjectPicker = subjects.length > 1;

  return (
    <div className={styles.bar}>
      <span className={cx(styles.tunedTo, 'u-label')}>Tuned to</span>

      {showSubjectPicker ? (
        <div className={styles.subjectPicker}>
          <button
            type="button"
            className={styles.subjectButton}
            aria-haspopup="menu"
            aria-expanded={subjectMenuOpen}
            onClick={() => setSubjectMenuOpen((o) => !o)}
          >
            {currentSubject.displayName}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {subjectMenuOpen ? (
            <ul className={styles.subjectMenu} role="menu">
              {subjects.map((s) => (
                <li key={s.profileId}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={s.profileId === currentSubject.profileId}
                    className={styles.subjectItem}
                    onClick={() => selectSubject(s)}
                  >
                    {s.displayName}
                    {s.isSelf ? <span className={styles.tag}> (you)</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <span className={styles.subjectButton}>{currentSubject.displayName}</span>
      )}

      {trainers.length === 0 ? (
        <span className={styles.connectPrompt}>Connect a coach</span>
      ) : (
        <div className={styles.tabs} role="tablist" aria-label="Trainer channels">
          {trainers.map((t) => {
            const selected =
              active?.subjectProfileId === currentSubject.profileId &&
              active?.trainerId === t.trainerId;
            return (
              <button
                key={t.trainerId}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cx(styles.tab, selected && styles.tabActive)}
                onClick={() => tune(currentSubject, t.trainerId)}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
