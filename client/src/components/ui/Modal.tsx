import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '@/lib/cx';
import { useFocusTrap } from './useFocusTrap';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** 'sheet' slides up from the bottom (mobile-style / Channel Bar). */
  variant?: 'modal' | 'sheet';
  /** 'foul' marks a destructive dialog. */
  tone?: 'default' | 'foul';
}

/** Overlay dialog with focus-trap + restore, ESC + scrim close; → bottom-sheet on mobile. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  variant = 'modal',
  tone = 'default',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(panelRef, open);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(styles.panel, styles[size], variant === 'sheet' && styles.sheet, tone === 'foul' && styles.foul)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={cx(styles.title, 'u-display-l')}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
