import { DestructiveConfirm } from '@/components/ui/DestructiveConfirm';
import { useDeactivateUserMutation } from '@/features/users/api';
import type { UserResponse } from '@/types/api';

export interface DeactivateConfirmProps {
  open: boolean;
  user: UserResponse;
  onClose: () => void;
  onDeactivated: (user: UserResponse) => void;
}

/**
 * Reversible deactivation (FR-013). H2: the backend now revokes ALL of the user's
 * sessions immediately, so the copy says so explicitly. Optional reason.
 */
export function DeactivateConfirm({ open, user, onClose, onDeactivated }: Readonly<DeactivateConfirmProps>) {
  const [deactivate, { isLoading }] = useDeactivateUserMutation();

  const onConfirm = async (reason: string) => {
    try {
      const updated = await deactivate({ id: user.id, reason: reason || undefined }).unwrap();
      onDeactivated(updated);
      onClose();
    } catch {
      /* surfaced globally; keep the dialog open so the admin can retry */
    }
  };

  return (
    <DestructiveConfirm
      open={open}
      title={`Deactivate ${user.firstName} ${user.lastName}?`}
      onCancel={onClose}
      onConfirm={onConfirm}
      confirmLabel="Deactivate"
      busy={isLoading}
      consequences={[
        'Signs the user out of all sessions immediately.',
        'They can no longer log in (their account is marked inactive).',
        'History and analytics are kept — this is reversible.',
      ]}
    />
  );
}
