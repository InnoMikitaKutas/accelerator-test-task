import type { CSSProperties } from 'react';
import { cx } from '@/lib/cx';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string;
  className?: string;
  /** Accessible label; when set the skeleton is announced, otherwise it is hidden. */
  label?: string;
}

/** Chalk-sheen shimmer placeholder; matches final layout to avoid shift. */
export function Skeleton({ width, height = '1em', radius = 'var(--r-sm)', className, label }: SkeletonProps) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return (
    <span
      className={cx(styles.skeleton, className)}
      style={style}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'status' : undefined}
    />
  );
}
