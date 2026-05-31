import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { parseApiError } from '@/services/apiError';
import { useCreateTrainerMutation } from '@/features/users/api';
import type { UserResponse } from '@/types/api';
import styles from './users.module.css';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  phone: z.string().max(32).optional(),
  businessName: z.string().min(1, 'Business name is required').max(200),
  businessAddress: z.string().max(500).optional(),
});
type CreateValues = z.infer<typeof schema>;

type OnboardingMode = 'INVITE' | 'TEMP_PASSWORD';

const FIELDS = ['email', 'firstName', 'lastName', 'phone', 'businessName', 'businessAddress'] as const;
type FieldName = (typeof FIELDS)[number];

export interface CreateTrainerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (user: UserResponse) => void;
}

/** Create a trainer account (FR-011). Account + Business + onboarding-mode toggle. */
export function CreateTrainerModal({ open, onClose, onCreated }: Readonly<CreateTrainerModalProps>) {
  const [create, { isLoading }] = useCreateTrainerMutation();
  const [mode, setMode] = useState<OnboardingMode>('INVITE');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', firstName: '', lastName: '', phone: '', businessName: '', businessAddress: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const user = await create({
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone?.trim() ? values.phone.trim() : undefined,
        businessName: values.businessName,
        businessAddress: values.businessAddress?.trim() ? values.businessAddress.trim() : undefined,
        onboardingMode: mode,
      }).unwrap();
      onCreated(user);
      onClose();
    } catch (e) {
      const parsed = parseApiError(e);
      if (parsed.errorCode === 'EMAIL_EXISTS') {
        setError('email', { message: 'An account with this email already exists.' });
        return;
      }
      for (const fe of parsed.details ?? []) {
        if ((FIELDS as readonly string[]).includes(fe.field)) {
          setError(fe.field as FieldName, { message: fe.message });
        }
      }
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create trainer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="create-trainer-form" type="submit" loading={isLoading}>
            Create trainer
          </Button>
        </>
      }
    >
      <form id="create-trainer-form" onSubmit={onSubmit} noValidate>
        <section className={styles.section} aria-label="Account">
          <span className={`u-label ${styles.sectionLabel}`}>Account</span>
          <FormField label="Email" required error={errors.email?.message}>
            {({ id, describedBy, invalid }) => (
              <input id={id} type="email" autoComplete="off" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('email')} />
            )}
          </FormField>
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
              <input id={id} type="tel" autoComplete="off" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('phone')} />
            )}
          </FormField>
        </section>

        <section className={styles.section} aria-label="Business">
          <span className={`u-label ${styles.sectionLabel}`}>Business</span>
          <FormField label="Business name" required error={errors.businessName?.message}>
            {({ id, describedBy, invalid }) => (
              <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('businessName')} />
            )}
          </FormField>
          <FormField label="Business address" error={errors.businessAddress?.message}>
            {({ id, describedBy, invalid }) => (
              <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('businessAddress')} />
            )}
          </FormField>
        </section>

        <section className={styles.section} aria-label="Onboarding">
          <span className={`u-label ${styles.sectionLabel}`}>Onboarding</span>
          <div className={styles.segmented} role="group" aria-label="Onboarding mode">
            <button
              type="button"
              className={styles.segment}
              aria-pressed={mode === 'INVITE'}
              onClick={() => setMode('INVITE')}
            >
              Invite email
            </button>
            <button
              type="button"
              className={styles.segment}
              aria-pressed={mode === 'TEMP_PASSWORD'}
              onClick={() => setMode('TEMP_PASSWORD')}
            >
              Temp password
            </button>
          </div>
          <p className={styles.sectionLabel} style={{ fontSize: 'var(--fs-body-s)' }}>
            {mode === 'INVITE'
              ? 'The trainer gets an email link to set their own password.'
              : 'You set a temporary password they must change at first login.'}
          </p>
        </section>
      </form>
    </Modal>
  );
}
