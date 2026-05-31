import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './StatusBadge.module.css';

export type BadgeTone = 'go' | 'pending' | 'foul' | 'info' | 'neutral';

export interface StatusBadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  /** DELETED users strike through the label (FR-014). */
  strikethrough?: boolean;
  className?: string;
}

/** Pill status badge — semantic color + tint background, `label` type. */
export function StatusBadge({ tone = 'neutral', children, strikethrough, className }: StatusBadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], strikethrough && styles.struck, className)}>
      {children}
    </span>
  );
}
