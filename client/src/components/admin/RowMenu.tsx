import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import styles from './users.module.css';

export interface RowMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export interface RowMenuProps {
  /** Accessible label, e.g. "Actions for Casey Coach". */
  label: string;
  items: RowMenuItem[];
}

/** Compact ⋮ actions menu: button + role="menu" list, closes on select/Escape/outside. */
export function RowMenu({ label, items }: Readonly<RowMenuProps>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div
      className={styles.menuWrap}
      ref={wrapRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        className={styles.menuBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>
      {open ? (
        <ul className={styles.menu} role="menu">
          {items.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                className={item.danger ? `${styles.menuItem} ${styles.menuItemDanger}` : styles.menuItem}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
