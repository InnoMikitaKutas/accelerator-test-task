import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import styles from './CountdownRing.module.css';

export interface CountdownRingProps {
  /** ISO timestamp the countdown targets. */
  expiresAt: string;
  /** Window length (ms) the ring represents, e.g. 1h impersonation / 48h approval. */
  totalMs: number;
  /** Remaining ms at/below which the ring turns `--foul`. */
  foulThresholdMs?: number;
  /** Fired once when the countdown reaches zero. */
  onComplete?: () => void;
  size?: number;
  /** Accessible prefix, e.g. "Auto-exit in". */
  label?: string;
}

function format(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** SVG ring + mono center; pending→foul under threshold; text equivalent for SR. */
export function CountdownRing({
  expiresAt,
  totalMs,
  foulThresholdMs = 0,
  onComplete,
  size = 56,
  label,
}: CountdownRingProps) {
  const target = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [now, setNow] = useState(() => Date.now());
  const completed = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, target - now);

  useEffect(() => {
    if (remaining <= 0 && !completed.current) {
      completed.current = true;
      onComplete?.();
    }
  }, [remaining, onComplete]);

  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remaining / totalMs)) : 0;
  const foul = remaining <= foulThresholdMs;
  const text = format(remaining);

  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);

  return (
    <span
      className={cx(styles.ring, foul && styles.foul)}
      role="timer"
      aria-label={`${label ? `${label} ` : ''}${text}`}
      data-tone={foul ? 'foul' : 'pending'}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className={styles.track}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className={styles.progress}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={cx(styles.digits, 'u-mono')} aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
