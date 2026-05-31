import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, MailWarning } from 'lucide-react';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { parseApiError } from '@/services/apiError';
import { useVerifyEmailMutation, useResendVerificationMutation } from '@/features/auth/api';
import { AuthLayout } from './AuthLayout';
import { AuthBanner } from './AuthBanner';
import styles from './auth.module.css';

type Status = 'verifying' | 'success' | 'expired' | 'used' | 'invalid';

const HEADINGS: Record<Status, string> = {
  verifying: 'Verifying…',
  success: 'Email verified',
  used: 'Already verified',
  expired: 'Verification link problem',
  invalid: 'Verification link problem',
};

/** Token-error code → the screen state it lands in (anything else is "invalid"). */
const TOKEN_ERROR_STATUS: Record<string, Status> = {
  TOKEN_EXPIRED: 'expired',
  TOKEN_USED: 'used',
};

const resendSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});
type ResendValues = z.infer<typeof resendSchema>;

/** Inline resend form, shown when the verification link has expired. */
function ResendForm() {
  const [resend, { isLoading }] = useResendVerificationMutation();
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResendValues>({ resolver: zodResolver(resendSchema), defaultValues: { email: '' } });

  if (sent) {
    return (
      <AuthBanner tone="go" live="status">
        If an unverified account exists for that email, a new link is on its way.
      </AuthBanner>
    );
  }

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await resend({ email }).unwrap();
    } catch {
      /* always 202 — no enumeration */
    } finally {
      setSent(true);
    }
  });

  return (
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
      <Button type="submit" className={styles.submit} loading={isLoading}>
        Resend verification link
      </Button>
    </form>
  );
}

export function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [verify] = useVerifyEmailMutation();
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'invalid');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    verify({ token })
      .unwrap()
      .then(() => setStatus('success'))
      .catch((e) => {
        const code = parseApiError(e).errorCode ?? '';
        setStatus(TOKEN_ERROR_STATUS[code] ?? 'invalid');
      });
  }, [token, verify]);

  return (
    <AuthLayout>
      <header className={styles.head}>
        <p className="u-label">Verify email</p>
        <h1>{HEADINGS[status]}</h1>
      </header>

      {status === 'verifying' ? (
        <output className={styles.muted}>Confirming your email address…</output>
      ) : null}

      {status === 'success' ? (
        <div className={styles.panel}>
          <span className={styles.panelIcon} data-tone="go">
            <CheckCircle2 size={22} aria-hidden="true" />
          </span>
          <p className={styles.muted}>Your email is confirmed. You can sign in now.</p>
          <Button type="button" className={styles.submit} onClick={() => navigate('/login')}>
            Continue to login
          </Button>
        </div>
      ) : null}

      {status === 'used' ? (
        <div className={styles.panel}>
          <span className={styles.panelIcon} data-tone="go">
            <CheckCircle2 size={22} aria-hidden="true" />
          </span>
          <p className={styles.muted}>This email was already verified. Just log in.</p>
          <Link to="/login">Go to login</Link>
        </div>
      ) : null}

      {status === 'expired' ? (
        <>
          <AuthBanner tone="pending" live="alert">
            This verification link has expired. Request a fresh one below.
          </AuthBanner>
          <ResendForm />
        </>
      ) : null}

      {status === 'invalid' ? (
        <div className={styles.panel}>
          <span className={styles.panelIcon} data-tone="foul">
            <MailWarning size={22} aria-hidden="true" />
          </span>
          <p className={styles.muted}>
            This verification link is invalid or incomplete. Request a new one below.
          </p>
          <ResendForm />
        </div>
      ) : null}
    </AuthLayout>
  );
}
