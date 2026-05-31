import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cx } from '@/lib/cx';
import type { Tone } from '@/services/errorMap';
import styles from './AuthBanner.module.css';

export interface AuthBannerProps {
  tone: Tone;
  children: ReactNode;
  /** An optional inline action (e.g. "Resend verification"). */
  action?: ReactNode;
  /** `alert` interrupts a screen reader (errors); `status` is polite (info/success). */
  live?: 'alert' | 'status';
  className?: string;
}

const ICON: Record<Tone, typeof Info> = {
  info: Info,
  go: CheckCircle2,
  pending: AlertCircle,
  foul: AlertCircle,
};

/** Inline, tone-coded message used across the auth screens (errors, hints, confirmations). */
export function AuthBanner({
  tone,
  children,
  action,
  live = 'status',
  className,
}: Readonly<AuthBannerProps>) {
  const Icon = ICON[tone];
  return (
    <div className={cx(styles.banner, styles[tone], className)} role={live}>
      <Icon size={18} aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <span>{children}</span>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  );
}
