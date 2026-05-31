import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { parseApiError } from '@/services/apiError';
import { useResetPasswordMutation } from '@/features/auth/api';
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
type ResetValues = z.infer<typeof schema>;

const TOKEN_CODES = new Set(['TOKEN_EXPIRED', 'TOKEN_USED', 'TOKEN_INVALID']);

export function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [reset, { isLoading }] = useResetPasswordMutation();

  const [done, setDone] = useState(false);
  const [tokenDead, setTokenDead] = useState(!token);
  const [banner, setBanner] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<ResetValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ newPassword }) => {
    setBanner(null);
    try {
      await reset({ token, newPassword }).unwrap();
      setDone(true);
    } catch (e) {
      const parsed = parseApiError(e);
      if (parsed.errorCode && TOKEN_CODES.has(parsed.errorCode)) {
        setTokenDead(true);
      } else if (parsed.errorCode === 'VALIDATION_ERROR') {
        const fe = parsed.details?.find((d) => d.field === 'newPassword');
        setError('newPassword', { message: fe?.message ?? 'That password is not allowed' });
      } else {
        setBanner(parsed.message ?? 'Something went wrong. Please try again.');
      }
    }
  });

  if (done) {
    return (
      <AuthLayout>
        <header className={styles.head}>
          <p className="u-label">Reset password</p>
          <h1>Password updated</h1>
        </header>
        <div className={styles.panel}>
          <span className={styles.panelIcon} data-tone="go">
            <KeyRound size={22} aria-hidden="true" />
          </span>
          <p className={styles.muted}>Your password has been reset. Sign in with your new password.</p>
          <Button type="button" className={styles.submit} onClick={() => navigate('/login')}>
            Continue to login
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (tokenDead) {
    return (
      <AuthLayout>
        <header className={styles.head}>
          <p className="u-label">Reset password</p>
          <h1>This link can&apos;t be used</h1>
        </header>
        <AuthBanner tone="pending" live="alert">
          This reset link is invalid or has expired (links last 1 hour and work once). Request a new
          one to continue.
        </AuthBanner>
        <p className={styles.alt}>
          <Link to="/forgot-password">Request a new reset link</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <header className={styles.head}>
        <p className="u-label">Reset password</p>
        <h1>Set a new password</h1>
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
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}
