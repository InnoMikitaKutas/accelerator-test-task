import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { dismissToast } from '@/features/toasts/toastsSlice';
import type { Toast as ToastData } from '@/features/toasts/toastsSlice';
import { Toast } from './Toast';
import styles from './ToastHost.module.css';

function ToastItem({ toast }: { toast: ToastData }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!toast.durationMs) return;
    const id = setTimeout(() => dispatch(dismissToast(toast.id)), toast.durationMs);
    return () => clearTimeout(id);
  }, [toast.id, toast.durationMs, dispatch]);

  return <Toast toast={toast} onDismiss={(id) => dispatch(dismissToast(id))} />;
}

/** Renders the toasts slice as a top-right stack. Live-region roles live on each toast. */
export function ToastHost() {
  const toasts = useAppSelector((s) => s.toasts.items);
  if (toasts.length === 0) return null;

  return (
    <div className={styles.host}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
