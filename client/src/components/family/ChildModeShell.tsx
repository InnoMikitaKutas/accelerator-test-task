import { useState } from 'react';
import { Lock, ShoppingCart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setContext } from '@/features/context/activeContextSlice';
import { pushToast } from '@/features/toasts/toastsSlice';
import { parseApiError } from '@/services/apiError';
import { useGetContextsQuery } from '@/features/context/api';
import { useCreatePurchaseRequestMutation } from '@/features/family/api';
import styles from './family.module.css';

/**
 * Constrained child experience (FR-025/026). No Zone-1 and no subject switcher — the
 * subject is fixed to the child themselves; only their trainer lane-tabs + Zone-3 show.
 * Locked actions are shown disabled with an "Ask a grown-up" affordance; a purchase
 * attempt creates a PENDING approval routed to the parent rather than a hard block.
 */
export function ChildModeShell() {
  const { data: contexts, isLoading } = useGetContextsQuery();
  const dispatch = useAppDispatch();
  const active = useAppSelector((s) => s.activeContext.current);
  const [requestPurchase, { isLoading: requesting }] = useCreatePurchaseRequestMutation();
  const [requested, setRequested] = useState(false);

  // The subject is always "me" (children can't switch subjects).
  const self = contexts?.subjects.find((s) => s.isSelf) ?? contexts?.subjects[0] ?? null;
  const trainers = self?.trainers ?? [];
  const activeTrainerId =
    active?.subjectProfileId === self?.profileId ? active?.trainerId : undefined;

  const tuneIn = (trainerId: string) => {
    if (self) dispatch(setContext({ subjectProfileId: self.profileId, trainerId }));
    setRequested(false);
  };

  const askToBuy = async () => {
    if (!self) return;
    try {
      await requestPurchase({
        childProfileId: self.profileId,
        itemRef: 'Session credit',
        paymentType: 'TOKEN',
        childNote: 'Can I get this please?',
      }).unwrap();
      setRequested(true);
    } catch (e) {
      const parsed = parseApiError(e);
      dispatch(
        pushToast({
          tone: 'foul',
          message: parsed.message ?? "We couldn't send your request. Try again.",
        }),
      );
    }
  };

  if (isLoading) {
    return (
      <main className={styles.childShell}>
        <Skeleton width={200} height={28} label="Loading your coaches" />
        <Skeleton height={120} />
      </main>
    );
  }

  return (
    <main className={styles.childShell}>
      <header>
        <p className="u-label">
          <Sparkles size={14} aria-hidden="true" /> Hi {self?.displayName ?? 'there'}!
        </p>
        <h1>Your coaches</h1>
      </header>

      {trainers.length ? (
        <div className={styles.laneTabs} role="tablist" aria-label="Your coaches">
          {trainers.map((t) => (
            <button
              key={t.trainerId}
              type="button"
              role="tab"
              aria-selected={activeTrainerId === t.trainerId}
              aria-pressed={activeTrainerId === t.trainerId}
              className={styles.laneTab}
              onClick={() => tuneIn(t.trainerId)}
            >
              {t.name}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>Ask a grown-up to connect you with a coach.</p>
      )}

      {activeTrainerId ? (
        <section className={styles.lockedCard} aria-label="Your channel">
          <h2 className={styles.sectionTitle}>This week</h2>
          {requested ? (
            <p className={styles.askGrownup}>
              <Sparkles size={14} aria-hidden="true" /> Nice! We asked a grown-up to approve it —
              you&apos;ll hear back soon.
            </p>
          ) : (
            <Button loading={requesting} onClick={askToBuy}>
              <ShoppingCart size={16} aria-hidden="true" /> Ask to get this
            </Button>
          )}
        </section>
      ) : null}

      {/* Locked actions — shown, not hidden, with a gentle affordance. */}
      <section className={styles.lockedCard} aria-label="Grown-up settings">
        <h2 className={styles.sectionTitle}>Grown-up settings</h2>
        <Button variant="secondary" disabled aria-disabled="true">
          <Lock size={14} aria-hidden="true" /> Add a coach
        </Button>
        <p className={styles.askGrownup}>
          <Lock size={12} aria-hidden="true" /> Ask a grown-up to change your coaches or settings.
        </p>
      </section>
    </main>
  );
}
