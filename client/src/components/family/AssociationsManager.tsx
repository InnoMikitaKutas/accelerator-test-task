import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { EmptyState } from '@/components/ui/EmptyState';
import { DestructiveConfirm } from '@/components/ui/DestructiveConfirm';
import { useAppDispatch } from '@/app/hooks';
import { pushToast } from '@/features/toasts/toastsSlice';
import { parseApiError } from '@/services/apiError';
import { useAddChildTrainerMutation, useRemoveChildTrainerMutation } from '@/features/family/api';
import type { ChildSummary, TrainerRef } from '@/types/api';
import styles from './family.module.css';

export interface AssociationsManagerProps {
  open: boolean;
  child: ChildSummary;
  onClose: () => void;
}

/** Per-child trainer connections (FR-023): add via code, remove with a danger-confirm. */
export function AssociationsManager({ open, child, onClose }: Readonly<AssociationsManagerProps>) {
  const dispatch = useAppDispatch();
  const [addTrainer, { isLoading: adding }] = useAddChildTrainerMutation();
  const [removeTrainer, { isLoading: removing }] = useRemoveChildTrainerMutation();

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TrainerRef | null>(null);

  const onAdd = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setCodeError('Enter a connection code');
      return;
    }
    setCodeError(null);
    try {
      await addTrainer({ childId: child.profileId, body: { code: trimmed } }).unwrap();
      setCode('');
      dispatch(pushToast({ tone: 'go', message: `Connection added for ${child.firstName}.` }));
    } catch (e) {
      const parsed = parseApiError(e);
      setCodeError(parsed.message ?? "That code didn't work. Check it and try again.");
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    try {
      await removeTrainer({ childId: child.profileId, trainerId: pendingRemove.trainerId }).unwrap();
      dispatch(pushToast({ tone: 'info', message: `${pendingRemove.name} disconnected from ${child.firstName}.` }));
    } catch {
      dispatch(pushToast({ tone: 'foul', message: 'Could not remove the connection. Please try again.' }));
    } finally {
      setPendingRemove(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`${child.firstName}'s coaches`} size="sm">
      <div className={styles.form}>
        {child.trainers.length === 0 ? (
          <EmptyState title="No coaches yet" description="Add a connection with a coach's share-link code." />
        ) : (
          <ul className={styles.assocList}>
            {child.trainers.map((t) => (
              <li key={t.trainerId} className={styles.assocRow}>
                <span className={styles.assocName}>{t.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingRemove(t)}
                  aria-label={`Remove ${t.name}`}
                >
                  <Trash2 size={16} aria-hidden="true" /> Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.addRow}>
          <FormField label="Add a coach" error={codeError ?? undefined} helper="Paste the code from your coach's share link.">
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                value={code}
                placeholder="e.g. AB12CD"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </FormField>
          <Button loading={adding} onClick={onAdd}>
            Add
          </Button>
        </div>
      </div>

      <DestructiveConfirm
        open={pendingRemove !== null}
        title={`Remove ${pendingRemove?.name ?? 'this coach'}?`}
        confirmLabel="Remove connection"
        busy={removing}
        consequences={[
          `${child.firstName} will lose access to this coach's channel and its data.`,
          'Any upcoming RSVPs with this coach are cancelled.',
        ]}
        onCancel={() => setPendingRemove(null)}
        onConfirm={confirmRemove}
      />
    </Modal>
  );
}
