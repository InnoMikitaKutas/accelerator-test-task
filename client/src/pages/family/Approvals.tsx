import { useState } from 'react';
import { AlertCircle, ClipboardList, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { StatusBadge, type BadgeTone } from '@/components/ui/StatusBadge';
import { CountdownRing } from '@/components/ui/CountdownRing';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppDispatch } from '@/app/hooks';
import { pushToast } from '@/features/toasts/toastsSlice';
import { parseApiError } from '@/services/apiError';
import {
  useApproveApprovalMutation,
  useDenyApprovalMutation,
  useGetFamilyQuery,
  useListApprovalsQuery,
  useSetTokenSettingMutation,
} from '@/features/family/api';
import type { ApprovalResponse, ApprovalStatus } from '@/types/api';
import styles from '@/components/family/family.module.css';

const HOUR = 3_600_000;
const APPROVAL_WINDOW_MS = 48 * HOUR;
const FOUL_THRESHOLD_MS = 6 * HOUR;
const STATUSES: ApprovalStatus[] = ['PENDING', 'APPROVED', 'DENIED', 'EXPIRED'];

const STATUS_TONE: Record<ApprovalStatus, BadgeTone> = {
  PENDING: 'pending',
  APPROVED: 'go',
  DENIED: 'neutral',
  EXPIRED: 'foul',
};

function formatAmount(a: ApprovalResponse): string {
  if (a.paymentType === 'TOKEN') return 'Token';
  if (a.amount == null) return '—';
  return `$${(a.amount / 100).toFixed(2)}`;
}

/** Purchase approvals (FR-024, M3) — 48h ring + Approve/Deny; server drives EXPIRED. */
export function Approvals() {
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<ApprovalStatus | ''>('');
  const [childId, setChildId] = useState('');

  const { data, isLoading, isError, refetch } = useListApprovalsQuery({
    status: status || undefined,
    childProfileId: childId || undefined,
    limit: 50,
  });
  const { data: family } = useGetFamilyQuery();

  const [approve] = useApproveApprovalMutation();
  const [deny] = useDenyApprovalMutation();
  const [setToken] = useSetTokenSettingMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = data?.items ?? [];
  const children = family?.children ?? [];

  const decide = async (kind: 'approve' | 'deny', id: string, parentNote?: string) => {
    setBusyId(id);
    try {
      const run = kind === 'approve' ? approve : deny;
      await run({ id, parentNote: parentNote?.trim() ? parentNote.trim() : undefined }).unwrap();
      // success invalidates the Approval tag → the list refetches with the new status.
    } catch (e) {
      const parsed = parseApiError(e);
      if (parsed.errorCode === 'APPROVAL_EXPIRED') {
        dispatch(pushToast({ tone: 'pending', message: 'That request already expired (48h passed).' }));
        refetch(); // reconcile to the server's EXPIRED state (M3)
      } else if (parsed.errorCode === 'APPROVAL_ALREADY_DECIDED') {
        dispatch(pushToast({ tone: 'info', message: 'That request was already decided.' }));
        refetch();
      } else {
        dispatch(pushToast({ tone: 'foul', message: 'Could not save your decision. Please try again.' }));
      }
    } finally {
      setBusyId(null);
    }
  };

  const onToggleToken = async (childProfileId: string, allow: boolean) => {
    try {
      await setToken({ childId: childProfileId, allowTokenWithoutApproval: allow }).unwrap();
    } catch {
      dispatch(pushToast({ tone: 'foul', message: 'Could not update the token setting.' }));
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headTitles}>
          <p className="u-label">Family</p>
          <h1>Approvals</h1>
        </div>
      </header>

      <div className={styles.filters}>
        <div className={styles.filter}>
          <label htmlFor="ap-status" className="u-label">
            Status
          </label>
          <select id="ap-status" value={status} onChange={(e) => setStatus(e.target.value as ApprovalStatus | '')}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {children.length ? (
          <div className={styles.filter}>
            <label htmlFor="ap-child" className="u-label">
              Child
            </label>
            <select id="ap-child" value={childId} onChange={(e) => setChildId(e.target.value)}>
              <option value="">All children</option>
              {children.map((c) => (
                <option key={c.profileId} value={c.profileId}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton height={120} label="Loading approvals" />
      ) : isError ? (
        <div className={styles.loadError} role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <h2>We couldn't load approvals</h2>
            <p>Please try again.</p>
          </div>
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw size={16} aria-hidden="true" /> Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} aria-hidden="true" />}
          title="No approvals waiting"
          description="Purchase requests from your children will show up here."
        />
      ) : (
        <ul className={styles.approvalList}>
          {items.map((a) => (
            <ApprovalCard
              key={a.id}
              approval={a}
              busy={busyId === a.id}
              onApprove={(note) => decide('approve', a.id, note)}
              onDeny={(note) => decide('deny', a.id, note)}
              onExpire={refetch}
            />
          ))}
        </ul>
      )}

      {children.length ? (
        <section className={styles.tokenSettings} aria-labelledby="token-settings">
          <h2 id="token-settings" className={styles.sectionTitle}>
            Token settings
          </h2>
          <p className={styles.muted}>
            Allow a child to spend tokens without asking you each time. Off by default.
          </p>
          {children.map((c) => (
            <div key={c.profileId} className={styles.tokenRow}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={c.allowTokenWithoutApproval}
                  onChange={(e) => onToggleToken(c.profileId, e.target.checked)}
                />
                <span>
                  {c.firstName} {c.lastName}
                </span>
              </label>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function ApprovalCard({
  approval,
  busy,
  onApprove,
  onDeny,
  onExpire,
}: Readonly<{
  approval: ApprovalResponse;
  busy: boolean;
  onApprove: (note: string) => void;
  onDeny: (note: string) => void;
  onExpire: () => void;
}>) {
  const [note, setNote] = useState('');
  const pending = approval.status === 'PENDING';

  return (
    <li className={styles.approvalCard}>
      {pending ? (
        <div className={styles.approvalRing}>
          <CountdownRing
            expiresAt={approval.expiresAt}
            totalMs={APPROVAL_WINDOW_MS}
            foulThresholdMs={FOUL_THRESHOLD_MS}
            label="Auto-denies in"
            onComplete={onExpire}
          />
        </div>
      ) : null}

      <div className={styles.approvalBody}>
        <div className={styles.approvalHead}>
          <StatusBadge tone={STATUS_TONE[approval.status]}>{approval.status}</StatusBadge>
          <span>{approval.childDisplayName}</span>
        </div>
        <p className={styles.approvalItem}>{approval.itemRef}</p>
        <p className={styles.approvalAmount}>{formatAmount(approval)}</p>

        {pending ? (
          <>
            <FormField label="Note (optional)">
              {({ id }) => (
                <textarea id={id} rows={2} value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
              )}
            </FormField>
            <div className={styles.approvalActions}>
              <Button loading={busy} onClick={() => onApprove(note)}>
                Approve
              </Button>
              <Button variant="secondary" loading={busy} onClick={() => onDeny(note)}>
                Deny
              </Button>
            </div>
          </>
        ) : (
          <p className={styles.terminalNote}>
            {approval.status === 'EXPIRED'
              ? 'Auto-denied after 48 hours.'
              : approval.parentNote
                ? `Your note: ${approval.parentNote}`
                : `Marked ${approval.status.toLowerCase()}.`}
          </p>
        )}
      </div>
    </li>
  );
}
