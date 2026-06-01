import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ClipboardList, Plus, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppDispatch } from '@/app/hooks';
import { setContext } from '@/features/context/activeContextSlice';
import { useGetFamilyQuery } from '@/features/family/api';
import type { ChildSummary, TrainerRef } from '@/types/api';
import { AddChildFlow } from '@/components/family/AddChildFlow';
import { AssociationsManager } from '@/components/family/AssociationsManager';
import styles from '@/components/family/family.module.css';

function initials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?';
}

/** Family roster board (FR-027) — Me + children, trainer lane-chips tune the channel. */
export function FamilyRoster() {
  const { data, isLoading, isError, refetch } = useGetFamilyQuery();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);

  const children = data?.children ?? [];
  // Trainers known to the family (offered when adding a child / its connections).
  const knownTrainers = useMemo(() => {
    const map = new Map<string, TrainerRef>();
    for (const c of data?.children ?? []) for (const t of c.trainers) map.set(t.trainerId, t);
    return [...map.values()];
  }, [data?.children]);
  const manageChild = children.find((c) => c.profileId === manageId) ?? null;

  const tuneIn = (subjectProfileId: string, trainerId: string) => {
    dispatch(setContext({ subjectProfileId, trainerId }));
    navigate('/');
  };

  if (isLoading) {
    return (
      <main className={styles.page}>
        <Skeleton width={180} height={28} label="Loading your family" />
        <div className={styles.board}>
          <Skeleton height={140} />
          <Skeleton height={140} />
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className={styles.page}>
        <div className={styles.loadError} role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <h2>We couldn't load your family</h2>
            <p>Please check your connection and try again.</p>
          </div>
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw size={16} aria-hidden="true" /> Retry
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headTitles}>
          <p className="u-label">Family</p>
          <h1>Your roster</h1>
        </div>
        <Link to="/approvals" className={styles.statLink}>
          <span className={`${styles.statValue} u-stat`}>{data.pendingApprovals}</span>
          <span className="u-label">
            <ClipboardList size={14} aria-hidden="true" /> Approvals waiting
          </span>
        </Link>
      </header>

      <div className={styles.board}>
        {data.self ? (
          <article className={styles.subjectCard}>
            <div className={styles.subjectHead}>
              <span className={styles.monogram} aria-hidden="true">
                {initials(data.self.firstName, data.self.lastName)}
              </span>
              <div>
                <h2 className={styles.subjectName}>
                  {data.self.firstName} {data.self.lastName}
                </h2>
                <p className={styles.subjectMeta}>You</p>
              </div>
            </div>
          </article>
        ) : null}

        {children.map((child) => (
          <ChildCard key={child.profileId} child={child} onTuneIn={tuneIn} onManage={() => setManageId(child.profileId)} />
        ))}

        <button type="button" className={styles.addTile} onClick={() => setAddOpen(true)}>
          <Plus size={24} aria-hidden="true" />
          <span>Add a child</span>
        </button>
      </div>

      <AddChildFlow
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => undefined}
        knownTrainers={knownTrainers}
      />
      {manageChild ? (
        <AssociationsManager open child={manageChild} onClose={() => setManageId(null)} />
      ) : null}
    </main>
  );
}

function ChildCard({
  child,
  onTuneIn,
  onManage,
}: Readonly<{
  child: ChildSummary;
  onTuneIn: (subjectProfileId: string, trainerId: string) => void;
  onManage: () => void;
}>) {
  return (
    <article className={styles.subjectCard}>
      <div className={styles.subjectHead}>
        <span className={styles.monogram} aria-hidden="true">
          {initials(child.firstName, child.lastName)}
        </span>
        <div>
          <h2 className={styles.subjectName}>
            {child.firstName} {child.lastName}
          </h2>
          <p className={styles.subjectMeta}>{child.age != null ? `Age ${child.age}` : 'Child'}</p>
        </div>
      </div>

      {child.trainers.length ? (
        <div className={styles.chips}>
          {child.trainers.map((t) => (
            <button
              key={t.trainerId}
              type="button"
              className={styles.laneChip}
              onClick={() => onTuneIn(child.profileId, t.trainerId)}
            >
              {t.name}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>Connect a coach to get started.</p>
      )}

      <div className={styles.cardActions}>
        <Button variant="secondary" size="sm" onClick={onManage}>
          <Users size={14} aria-hidden="true" /> Manage coaches
        </Button>
      </div>
    </article>
  );
}
