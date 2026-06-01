import { X } from 'lucide-react';
import { cx } from '@/lib/cx';
import type { Toast as ToastData } from '@/features/toasts/toastsSlice';
import styles from './Toast.module.css';

export interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

/** Single toast. role=alert for foul (assertive), role=status otherwise (polite). */
export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div className={cx(styles.toast, styles[toast.tone])} role={toast.tone === 'foul' ? 'alert' : 'status'}>
      <div className={styles.content}>
        {toast.channelLabel ? (
          <span className={cx(styles.channel, 'u-label')}>{toast.channelLabel}</span>
        ) : null}
        <p className={styles.message}>{toast.message}</p>
      </div>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
