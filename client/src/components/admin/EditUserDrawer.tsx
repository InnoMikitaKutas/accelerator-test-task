import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { parseApiError } from '@/services/apiError';
import { useUpdateUserMutation } from '@/features/users/api';
import type { UserResponse } from '@/types/api';
import styles from './users.module.css';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  phone: z.string().max(32).optional(),
});
type EditValues = z.infer<typeof schema>;

export interface EditUserDrawerProps {
  open: boolean;
  user: UserResponse;
  onClose: () => void;
  onUpdated: (user: UserResponse) => void;
}

/** Edit a user's mutable fields. email + role are immutable (FR-038) → shown read-only. */
export function EditUserDrawer({ open, user, onClose, onUpdated }: Readonly<EditUserDrawerProps>) {
  const [update, { isLoading }] = useUpdateUserMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EditValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: user.firstName, lastName: user.lastName, phone: '' },
  });

  const onSubmit = handleSubmit(async ({ firstName, lastName, phone }) => {
    try {
      const updated = await update({
        id: user.id,
        body: { firstName, lastName, phone: phone?.trim() ? phone.trim() : undefined },
      }).unwrap();
      onUpdated(updated);
      onClose();
    } catch (e) {
      const parsed = parseApiError(e);
      for (const fe of parsed.details ?? []) {
        if (fe.field === 'firstName' || fe.field === 'lastName' || fe.field === 'phone') {
          setError(fe.field, { message: fe.message });
        }
      }
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${user.firstName} ${user.lastName}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="edit-user-form" type="submit" loading={isLoading}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-user-form" className={styles.section} onSubmit={onSubmit} noValidate>
        <div className={styles.grid2}>
          <FormField label="First name" required error={errors.firstName?.message}>
            {({ id, describedBy, invalid }) => (
              <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('firstName')} />
            )}
          </FormField>
          <FormField label="Last name" required error={errors.lastName?.message}>
            {({ id, describedBy, invalid }) => (
              <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('lastName')} />
            )}
          </FormField>
        </div>

        <FormField label="Phone" error={errors.phone?.message} helper="Optional. Include country code.">
          {({ id, describedBy, invalid }) => (
            <input id={id} type="tel" autoComplete="tel" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('phone')} />
          )}
        </FormField>

        <div className={styles.grid2}>
          <div className={styles.readonly}>
            <span className="u-label">Email</span>
            <span className={styles.readonlyValue}>
              <Lock size={14} aria-hidden="true" />
              {user.email}
            </span>
          </div>
          <div className={styles.readonly}>
            <span className="u-label">Role</span>
            <span className={styles.readonlyValue}>
              <Lock size={14} aria-hidden="true" />
              {user.role}
            </span>
          </div>
        </div>
      </form>
    </Modal>
  );
}
