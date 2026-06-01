import { DestructiveConfirm } from '@/components/ui/DestructiveConfirm';
import { useGdprDeleteUserMutation } from '@/features/users/api';
import type { UserResponse } from '@/types/api';

export interface GdprDeleteModalProps {
  open: boolean;
  user: UserResponse;
  onClose: () => void;
  onDeleted: (userId: string) => void;
}

/**
 * Irreversible GDPR delete (FR-014). Danger modal: consequence bullets, a required
 * `reason`, and a type-to-confirm email (mirrors GdprDeleteDto.confirmEmail). The
 * shared DestructiveConfirm keeps the primary disabled until both gates pass.
 */
export function GdprDeleteModal({ open, user, onClose, onDeleted }: Readonly<GdprDeleteModalProps>) {
  const [gdprDelete, { isLoading }] = useGdprDeleteUserMutation();

  const onConfirm = async (reason: string) => {
    try {
      // The typed email matched user.email (DestructiveConfirm's type-to-confirm gate).
      await gdprDelete({ id: user.id, body: { reason, confirmEmail: user.email } }).unwrap();
      onDeleted(user.id);
      onClose();
    } catch {
      /* surfaced globally; keep the dialog open */
    }
  };

  return (
    <DestructiveConfirm
      open={open}
      title={`Permanently delete ${user.firstName} ${user.lastName}?`}
      onCancel={onClose}
      onConfirm={onConfirm}
      confirmLabel="Delete permanently"
      busy={isLoading}
      requireReason
      reasonLabel="Reason (written to the deletion log)"
      typeToConfirm={{ value: user.email, label: `Type ${user.email} to confirm` }}
      consequences={[
        'Personal data is anonymized — this cannot be undone.',
        'Analytics totals are kept; the user appears as "Deleted User" in history.',
        'The account can never be reactivated.',
      ]}
    />
  );
}
