import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './FormField.module.css';

export interface FieldRenderProps {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

export interface FormFieldProps {
  label: string;
  /** A control, or a render-prop receiving wired `id`/`aria-describedby`/`invalid`. */
  children: ReactNode | ((field: FieldRenderProps) => ReactNode);
  error?: string;
  helper?: string;
  required?: boolean;
  className?: string;
}

/** Label (uppercase) + control + helper/error with full aria wiring. */
export function FormField({ label, children, error, helper, required, className }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  const describedBy = cx(helper && !error ? helperId : '', error ? errorId : '') || undefined;

  return (
    <div className={cx(styles.field, error && styles.invalid, className)}>
      <label htmlFor={id} className={cx(styles.label, 'u-label')}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {typeof children === 'function'
        ? children({ id, describedBy, invalid: Boolean(error) })
        : children}
      {helper && !error ? (
        <p id={helperId} className={styles.helper}>
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
