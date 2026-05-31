import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/Button';
import { useResendVerificationMutation } from '@/features/auth/api';
import styles from './VerifyEmailBanner.module.css';

/**
 * Persistent "verify your email" banner (L7). A /join registrant is auto-logged-in
 * while still unverified; this surfaces on every route until they verify (the backend
 * blocks scoped actions and re-login until then). Renders nothing for verified or
 * signed-out sessions. The full RequireVerified guard lands in Phase 10.1.
 */
export function VerifyEmailBanner() {
  const user = useAppSelector((s) => s.session.user);
  const [resend, { isLoading }] = useResendVerificationMutation();
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerified) return null;

  const onResend = async () => {
    try {
      await resend({ email: user.email }).unwrap();
    } catch {
      /* server always 202s (no account enumeration) */
    } finally {
      setSent(true);
    }
  };

  return (
    <div className={styles.banner} role="status">
      <MailWarning size={18} aria-hidden="true" className={styles.icon} />
      <p className={styles.text}>
        {sent
          ? 'Verification email sent — check your inbox to finish setting up your account.'
          : 'Verify your email to unlock everything. We sent a link when your account was created.'}
      </p>
      {!sent ? (
        <Button size="sm" variant="secondary" loading={isLoading} onClick={onResend}>
          Resend
        </Button>
      ) : null}
    </div>
  );
}
