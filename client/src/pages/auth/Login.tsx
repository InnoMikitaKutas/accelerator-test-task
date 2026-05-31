import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { cx } from '@/lib/cx';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { CountdownRing } from '@/components/ui/CountdownRing';
import { parseApiError } from '@/services/apiError';
import { FORCED_PASSWORD_CHANGE_ROUTE } from '@/services/errorMap';
import { useLoginMutation, useResendVerificationMutation } from '@/features/auth/api';
import { AuthLayout } from './AuthLayout';
import { AuthBanner } from './AuthBanner';
import { classifyLoginError, validationFieldErrors, type LoginErrorView } from './loginError';
import styles from './auth.module.css';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  // UI-only: the LoginDto carries no `remember` (cookie TTL is server config) — never sent.
  remember: z.boolean().optional(),
});
type LoginValues = z.infer<typeof schema>;

/** Post-login destination. Phase 10 refines this by role / defaultContext. */
const HOME = '/';

export function Login() {
  const navigate = useNavigate();
  const [login, { isLoading }] = useLoginMutation();
  const [resend, { isLoading: resending }] = useResendVerificationMutation();

  const [revealed, setRevealed] = useState(false);
  const [view, setView] = useState<LoginErrorView>({ kind: 'none' });
  const [resent, setResent] = useState(false);
  /** Epoch ms until which login stays disabled after RATE_LIMITED. */
  const [retryUntil, setRetryUntil] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: false },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setView({ kind: 'none' });
    setResent(false);
    try {
      const user = await login({ email, password }).unwrap();
      navigate(user.mustChangePassword ? FORCED_PASSWORD_CHANGE_ROUTE : HOME, { replace: true });
    } catch (e) {
      const parsed = parseApiError(e);
      const next = classifyLoginError(parsed);
      setView(next);
      if (next.kind === 'rateLimited') {
        setRetryUntil(Date.now() + (next.retryAfterSeconds ?? 60) * 1000);
      }
      for (const fe of validationFieldErrors(parsed)) {
        if (fe.field === 'email' || fe.field === 'password') {
          setError(fe.field, { message: fe.message });
        }
      }
    }
  });

  const onResend = async () => {
    const email = getValues('email');
    if (!email) return;
    try {
      await resend({ email }).unwrap();
    } catch {
      /* always 202 server-side; never reveal whether the account exists */
    } finally {
      setResent(true);
    }
  };

  const rateLimited = retryUntil !== null;

  return (
    <AuthLayout>
      <header className={styles.head}>
        <p className={cx('u-label', styles.kicker)}>Welcome back</p>
        <h1>Log in</h1>
        <p className={styles.sub}>Sign in to your training portal.</p>
      </header>

      {view.kind === 'invalid' ? (
        <AuthBanner tone="foul" live="alert">
          Email or password is incorrect.
        </AuthBanner>
      ) : null}

      {view.kind === 'inactive' ? (
        <AuthBanner tone="info" live="status">
          This account is inactive. If you think this is a mistake, contact your administrator or
          support.
        </AuthBanner>
      ) : null}

      {view.kind === 'unverified' && !resent ? (
        <AuthBanner
          tone="pending"
          live="alert"
          action={
            view.canResend ? (
              <Button size="sm" variant="secondary" loading={resending} onClick={onResend}>
                Resend verification
              </Button>
            ) : undefined
          }
        >
          Verify your email before signing in — we sent a link when your account was created.
        </AuthBanner>
      ) : null}

      {resent ? (
        <AuthBanner tone="go" live="status">
          Verification email sent — check your inbox.
        </AuthBanner>
      ) : null}

      {view.kind === 'rateLimited' ? (
        <AuthBanner tone="pending" live="alert">
          Too many attempts. Try again in{' '}
          <CountdownRing
            variant="text"
            label="try again in"
            expiresAt={new Date(retryUntil ?? Date.now()).toISOString()}
            totalMs={(view.retryAfterSeconds ?? 60) * 1000}
            onComplete={() => {
              setRetryUntil(null);
              setView({ kind: 'none' });
            }}
          />
          .
        </AuthBanner>
      ) : null}

      {view.kind === 'error' ? (
        <AuthBanner tone="foul" live="alert">
          {view.message}
        </AuthBanner>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <FormField label="Email" required error={errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="email"
              autoComplete="email"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...register('email')}
            />
          )}
        </FormField>

        <FormField label="Password" required error={errors.password?.message}>
          {({ id, describedBy, invalid }) => (
            <div className={styles.passwordWrap}>
              <input
                id={id}
                type={revealed ? 'text' : 'password'}
                autoComplete="current-password"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                {...register('password')}
              />
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setRevealed((r) => !r)}
                aria-label={revealed ? 'Hide password' : 'Show password'}
                aria-pressed={revealed}
              >
                {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          )}
        </FormField>

        <div className={styles.row}>
          <label className={styles.remember}>
            <input type="checkbox" {...register('remember')} />
            <span>Remember me</span>
          </label>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>

        <Button type="submit" className={styles.submit} loading={isLoading} disabled={rateLimited}>
          Log in
        </Button>
      </form>

      <p className={styles.alt}>Have an invite? Open the link your trainer sent you.</p>
    </AuthLayout>
  );
}
