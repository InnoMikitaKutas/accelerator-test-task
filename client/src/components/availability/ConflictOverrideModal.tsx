import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { useAppDispatch } from '@/app/hooks';
import { pushToast } from '@/features/toasts/toastsSlice';
import { useCreateOverrideMutation } from '@/features/availability/api';
import type { OverrideResult } from '@/types/api';
import styles from './availability.module.css';

export interface ConflictOverrideModalProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  coachId: string;
  coachName?: string;
  /** Human description of the conflict, e.g. "Sat 10:00–12:00 is outside their My Times." */
  conflictSummary?: string;
  onOverridden?: (result: OverrideResult) => void;
}

/**
 * ConflictOverrideModal (FR-031) — shown when assigning a coach against their My Times.
 * A `--pending` warning; overriding requires a typed reason. **L5:** Confirm stays
 * disabled until the reason is non-empty after trimming (mirrors server validation),
 * so whitespace alone can't satisfy it. Confirm logs the override (audited server-side);
 * Cancel keeps the conflict.
 */
export function ConflictOverrideModal({
  open,
  onClose,
  eventId,
  coachId,
  coachName,
  conflictSummary,
  onOverridden,
}: ConflictOverrideModalProps) {
  const dispatch = useAppDispatch();
  const [createOverride, { isLoading }] = useCreateOverrideMutation();
  const [reason, setReason] = useState('');

  // Reset the gate each time the dialog opens.
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const reasonOk = reason.trim().length > 0; // L5: trimmed, non-empty

  const onConfirm = async () => {
    if (!reasonOk) return;
    try {
      const result = await createOverride({ eventId, coachId, reason: reason.trim() }).unwrap();
      dispatch(pushToast({ tone: 'go', message: `Override logged${coachName ? ` for ${coachName}` : ''}.` }));
      onOverridden?.(result);
      onClose();
    } catch {
      dispatch(pushToast({ tone: 'foul', message: 'Could not log the override. Please try again.' }));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Override availability conflict?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!reasonOk || isLoading} loading={isLoading} onClick={onConfirm}>
            Override &amp; assign
          </Button>
        </>
      }
    >
      <div className={styles.overrideWarn} role="note">
        <AlertTriangle size={18} aria-hidden="true" />
        <p>
          {conflictSummary ?? `This assignment falls outside ${coachName ?? 'the coach'}’s My Times.`} Availability
          is advisory — you can override with a logged reason.
        </p>
      </div>
      <FormField label="Reason for override" required helper="Logged to the audit trail (FR-031).">
        {({ id, describedBy }) => (
          <textarea
            id={id}
            className={styles.reasonInput}
            aria-describedby={describedBy}
            rows={3}
            value={reason}
            placeholder="Why is this override necessary?"
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </FormField>
    </Modal>
  );
}
