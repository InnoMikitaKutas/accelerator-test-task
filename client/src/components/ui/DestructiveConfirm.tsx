import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { FormField } from './FormField';
import styles from './DestructiveConfirm.module.css';

export interface DestructiveConfirmProps {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  /** Bulleted consequences of the action. */
  consequences?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** Require a non-empty (trimmed) reason before confirming. */
  requireReason?: boolean;
  reasonLabel?: string;
  /** Irreversible actions: user must type `value` exactly (e.g. GDPR confirmEmail). */
  typeToConfirm?: { value: string; label: string };
  busy?: boolean;
  children?: ReactNode;
}

/** Destructive-confirm dialog (foul). Confirm stays disabled until the reason and/or
 *  type-to-confirm gates pass — mirrors the two-tier destructive pattern. */
export function DestructiveConfirm({
  open,
  title,
  onCancel,
  onConfirm,
  consequences,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  requireReason,
  reasonLabel = 'Reason',
  typeToConfirm,
  busy,
  children,
}: DestructiveConfirmProps) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');

  // Reset gates each time the dialog opens.
  useEffect(() => {
    if (open) {
      setReason('');
      setTyped('');
    }
  }, [open]);

  const reasonOk = !requireReason || reason.trim().length > 0;
  const typedOk = !typeToConfirm || typed.trim() === typeToConfirm.value;
  const canConfirm = reasonOk && typedOk && !busy;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      tone="foul"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            disabled={!canConfirm}
            loading={busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {consequences?.length ? (
        <ul className={styles.consequences}>
          {consequences.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}

      {requireReason ? (
        <FormField label={reasonLabel}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </FormField>
      ) : null}

      {typeToConfirm ? (
        <FormField label={typeToConfirm.label}>
          {({ id }) => (
            <input
              id={id}
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          )}
        </FormField>
      ) : null}
    </Modal>
  );
}
