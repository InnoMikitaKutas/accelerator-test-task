import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, Link2, Mail, RefreshCw, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge, type BadgeTone } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { DestructiveConfirm } from '@/components/ui/DestructiveConfirm';
import { useAppDispatch } from '@/app/hooks';
import { pushToast } from '@/features/toasts/toastsSlice';
import { usePaginated } from '@/lib/pagination';
import { parseApiError } from '@/services/apiError';
import {
  useCreateCoachInviteMutation,
  useCreateStaticLinkMutation,
  useListShareLinksQuery,
  useRevokeShareLinkMutation,
} from '@/features/sharelinks/api';
import type { ShareLink, ShareLinkStatus } from '@/types/api';
import styles from './sharelinks.module.css';

const INVITE_TONE: Record<ShareLinkStatus, BadgeTone> = {
  PENDING: 'pending',
  ACCEPTED: 'go',
  EXPIRED: 'neutral',
  REVOKED: 'neutral',
  ACTIVE: 'go',
};

/** Human "expires in N days" for a pending coach invite (BR-011, 7-day window). */
function expiryLabel(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Expired';
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

const inviteSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  personalNote: z.string().max(120, 'Keep it under 120 characters').optional(),
});
type InviteValues = z.infer<typeof inviteSchema>;

function CoachInviteModal({
  open,
  onClose,
  onInvited,
}: Readonly<{ open: boolean; onClose: () => void; onInvited: (link: ShareLink) => void }>) {
  const [invite, { isLoading }] = useCreateCoachInviteMutation();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', personalNote: '' },
  });

  const onSubmit = handleSubmit(async ({ email, personalNote }) => {
    try {
      const link = await invite({
        email,
        personalNote: personalNote?.trim() ? personalNote.trim() : undefined,
      }).unwrap();
      onInvited(link);
      reset();
      onClose();
    } catch (e) {
      const parsed = parseApiError(e);
      const fe = parsed.details?.find((d) => d.field === 'email');
      setError('email', { message: fe?.message ?? parsed.message ?? 'Could not send the invite.' });
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a coach"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="coach-invite-form" type="submit" loading={isLoading}>
            Send invite
          </Button>
        </>
      }
    >
      <form id="coach-invite-form" className={styles.form} onSubmit={onSubmit} noValidate>
        <p className={styles.modalHint}>
          We&apos;ll email a single-use link that expires in 7 days. The coach creates their own
          account.
        </p>
        <FormField label="Coach email" required error={errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="email"
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...register('email')}
            />
          )}
        </FormField>
        <FormField label="Personal note" error={errors.personalNote?.message} helper="Optional.">
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              rows={2}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...register('personalNote')}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}

/** Trainer ShareLinks manager (FR-033/028): one static player link + coach invites. */
export function ShareLinksManager() {
  const dispatch = useAppDispatch();

  // Static player link — a single persistent card (plain query + local override on regenerate).
  const staticQuery = useListShareLinksQuery({ type: 'static', limit: 1 });
  const [regenerated, setRegenerated] = useState<ShareLink | null>(null);
  const staticLink =
    regenerated ?? staticQuery.data?.items.find((l) => l.active) ?? staticQuery.data?.items[0] ?? null;

  // Coach invites — keyset list with local overlay (usePaginated is append-only).
  const { items, hasMore, isFetching, loadMore } = usePaginated(useListShareLinksQuery, {
    type: 'unique' as const,
  });
  const [prepended, setPrepended] = useState<ShareLink[]>([]);
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  const invites = useMemo(() => {
    const seen = new Set(items.map((i) => i.id));
    const extras = prepended.filter((p) => !seen.has(p.id));
    return [...extras, ...items].filter((i) => !removedIds.has(i.id));
  }, [items, prepended, removedIds]);

  const [createStatic, { isLoading: creatingStatic }] = useCreateStaticLinkMutation();
  const [revoke] = useRevokeShareLinkMutation();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const onCopy = async () => {
    if (!staticLink) return;
    try {
      await navigator.clipboard.writeText(staticLink.url);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      dispatch(pushToast({ tone: 'foul', message: 'Could not copy — copy the link manually.' }));
    }
  };

  const onGenerate = async (regenerate: boolean) => {
    try {
      const link = await createStatic({}).unwrap();
      setRegenerated(link);
      setRegenOpen(false);
      dispatch(
        pushToast({
          tone: 'go',
          message: regenerate ? 'New player link generated. The old one no longer works.' : 'Player link ready.',
        }),
      );
    } catch {
      dispatch(pushToast({ tone: 'foul', message: 'Could not generate the link. Please try again.' }));
    }
  };

  const onRevoke = async (link: ShareLink) => {
    setBusyIds((prev) => new Set(prev).add(link.id));
    try {
      await revoke(link.id).unwrap();
      setRemovedIds((prev) => new Set(prev).add(link.id));
      dispatch(pushToast({ tone: 'info', message: `Invite to ${link.targetEmail ?? 'coach'} revoked.` }));
    } catch {
      dispatch(pushToast({ tone: 'foul', message: 'Could not revoke the invite. Please try again.' }));
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(link.id);
        return next;
      });
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headTitles}>
          <p className="u-label">Trainer</p>
          <h1>ShareLinks</h1>
        </div>
      </header>

      {/* Static player link */}
      <section className={styles.section} aria-labelledby="sec-player-link">
        <div className={styles.sectionHead}>
          <h2 id="sec-player-link" className={styles.sectionTitle}>
            Player link
          </h2>
          <p className={styles.sectionSub}>
            Share this with players to join your roster. It never expires and can be used any number
            of times.
          </p>
        </div>

        {staticQuery.isLoading && !staticLink ? (
          <Skeleton height={120} label="Loading your player link" />
        ) : staticLink ? (
          <div className={styles.linkCard}>
            <div className={styles.codeBlock}>
              <span className="u-label">Code</span>
              <span className={`${styles.code} u-mono`}>{staticLink.code}</span>
            </div>
            <div className={styles.linkBody}>
              <div className={styles.shareUrl}>
                <span className="u-label">Share URL</span>
                <span className={styles.url}>{staticLink.url}</span>
              </div>
              <div className={styles.linkStats}>
                <div className={styles.stat}>
                  <span className={`${styles.statValue} u-stat`}>{staticLink.useCount}</span>
                  <span className="u-label">{staticLink.useCount === 1 ? 'join' : 'joins'}</span>
                </div>
              </div>
            </div>
            <div className={styles.linkActions}>
              <Button variant="secondary" onClick={onCopy}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
              <Button variant="ghost" onClick={() => setRegenOpen(true)}>
                <RefreshCw size={16} aria-hidden="true" /> Regenerate
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Link2 size={28} aria-hidden="true" />}
            title="No player link yet"
            description="Generate a link players can use to join your roster."
            action={
              <Button loading={creatingStatic} onClick={() => onGenerate(false)}>
                Generate player link
              </Button>
            }
          />
        )}
      </section>

      {/* Coach invites */}
      <section className={styles.section} aria-labelledby="sec-coach-invites">
        <div className={styles.sectionHead}>
          <h2 id="sec-coach-invites" className={styles.sectionTitle}>
            Coach invites
          </h2>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus size={16} aria-hidden="true" /> Invite coach
          </Button>
        </div>

        {invites.length === 0 && !isFetching ? (
          <EmptyState
            icon={<Mail size={28} aria-hidden="true" />}
            title="No coach invites"
            description="Invite a coach by email — they get a single-use link that expires in 7 days."
          />
        ) : (
          <ul className={styles.inviteList}>
            {invites.map((inv) => {
              const terminal = inv.status !== 'PENDING';
              const busy = busyIds.has(inv.id);
              return (
                <li key={inv.id} className={styles.inviteRow} data-muted={terminal || undefined}>
                  <div className={styles.inviteMain}>
                    <span className={styles.inviteEmail}>{inv.targetEmail ?? '—'}</span>
                    <div className={styles.inviteMeta}>
                      <StatusBadge tone={INVITE_TONE[inv.status]}>{inv.status}</StatusBadge>
                      {inv.status === 'PENDING' ? (
                        <span className={styles.expiry}>{expiryLabel(inv.expiresAt)}</span>
                      ) : null}
                    </div>
                  </div>
                  {inv.status === 'PENDING' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busy}
                      onClick={() => onRevoke(inv)}
                      aria-label={`Revoke invite to ${inv.targetEmail ?? 'coach'}`}
                    >
                      <X size={16} aria-hidden="true" /> Revoke
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {hasMore ? (
          <div className={styles.loadMore}>
            <Button variant="secondary" loading={isFetching} onClick={loadMore}>
              Load more
            </Button>
          </div>
        ) : null}
      </section>

      <CoachInviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(link) => setPrepended((prev) => [link, ...prev])}
      />

      <DestructiveConfirm
        open={regenOpen}
        title="Regenerate player link?"
        confirmLabel="Regenerate"
        busy={creatingStatic}
        consequences={[
          'The current link and code stop working immediately.',
          'Anyone you already shared the old link with will need the new one.',
        ]}
        onCancel={() => setRegenOpen(false)}
        onConfirm={() => onGenerate(true)}
      />
    </main>
  );
}
