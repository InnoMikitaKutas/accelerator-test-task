import { ShieldAlert } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/Button';
import { CountdownRing } from '@/components/ui/CountdownRing';
import { useExitImpersonationMutation } from '@/features/impersonation/api';
import styles from './ImpersonationBanner.module.css';

const ONE_HOUR_MS = 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * "Official mode" hazard banner (FR-015, H1). Sticky above everything; mono
 * countdown to the real 1h expiry (foul under 5 min); Exit ends impersonation.
 * role="alert"; the Exit button is the first focusable in the document.
 */
export function ImpersonationBanner() {
  const user = useAppSelector((s) => s.session.user);
  const [exit, { isLoading }] = useExitImpersonationMutation();
  const impersonatedBy = user?.impersonatedBy;

  if (!user || !impersonatedBy) return null;

  return (
    <>
      <div className={styles.banner} role="alert">
        <ShieldAlert size={18} aria-hidden="true" className={styles.icon} />
        <span className={styles.text}>
          OFFICIAL VIEW — you are acting as{' '}
          <strong>
            {user.firstName} {user.lastName} ({user.role})
          </strong>
        </span>
        <span className={styles.countdown}>
          auto-exit in{' '}
          <CountdownRing
            variant="text"
            expiresAt={impersonatedBy.expiresAt}
            totalMs={ONE_HOUR_MS}
            foulThresholdMs={FIVE_MIN_MS}
            label="auto-exit in"
          />
        </span>
        <Button
          size="sm"
          variant="secondary"
          className={styles.exit}
          loading={isLoading}
          onClick={() => exit()}
        >
          Exit
        </Button>
      </div>
      {/* 4px hazard inset framing the viewport while impersonating. */}
      <div className={styles.viewportFrame} aria-hidden="true" />
    </>
  );
}
