import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { parseApiError } from '@/services/apiError';
import { useChangePasswordMutation } from '@/features/auth/api';
import { AuthLayout } from './AuthLayout';
import { AuthBanner } from './AuthBanner';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import styles from './auth.module.css';

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(128, 'Use at most 128 characters')
      .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'Include a letter and a number'),
    confirm: z.string().min(1, 'Re-enter your new password'),
  })
  .refine((d) => d.newPassword === d.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
type ForcedValues = z.infer<typeof schema>;

/** Post-login destination once the temp password is replaced (Phase 10 refines). */
const HOME = '/';

/**
 * FR-005: a temp-password user can reach nothing else until they change it. New
 * password only (no current); the change rotates the session server-side, so the
 * Session-tag invalidation refetches /auth/me with mustChangePassword cleared.
 */
export function ForcedPasswordChange() {
  const navigate = useNavigate();
  const [change, { isLoading }] = useChangePasswordMutation();
  const [banner, setBanner] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<ForcedValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ newPassword }) => {
    setBanner(null);
    try {
      await change({ newPassword, fromTempPassword: true }).unwrap();
      navigate(HOME, { replace: true });
    } catch (e) {
      const parsed = parseApiError(e);
      if (parsed.errorCode === 'VALIDATION_ERROR') {
        const fe = parsed.details?.find((d) => d.field === 'newPassword');
        setError('newPassword', { message: fe?.message ?? 'That password is not allowed' });
      } else {
        setBanner(parsed.message ?? 'Something went wrong. Please try again.');
      }
    }
  });

  return (
    <AuthLayout>
      <header className={styles.head}>
        <p className="u-label">Security</p>
        <h1>Choose a new password</h1>
        <p className={styles.sub}>
          You signed in with a temporary password. Set a permanent one to continue to your account.
        </p>
      </header>

      {banner ? (
        <AuthBanner tone="foul" live="alert">
          {banner}
        </AuthBanner>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <FormField label="New password" required error={errors.newPassword?.message}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...register('newPassword')}
            />
          )}
        </FormField>
        <PasswordStrengthMeter value={watch('newPassword')} />

        <FormField label="Confirm new password" required error={errors.confirm?.message}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...register('confirm')}
            />
          )}
        </FormField>

        <Button type="submit" className={styles.submit} loading={isLoading}>
          Set password &amp; continue
        </Button>
      </form>
    </AuthLayout>
  );
}
