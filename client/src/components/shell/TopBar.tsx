import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { cx } from '@/lib/cx';
import type { SessionUser } from '@/types/api';
import { NotificationsBell, type NotificationAlert } from './NotificationsBell';
import styles from './TopBar.module.css';

export interface TopBarProps {
  user: SessionUser;
  alerts?: NotificationAlert[];
  onSelectAlert?: (alert: NotificationAlert) => void;
  onToggleRail?: () => void;
  /** Global search slot (Super Admin / Trainer). */
  search?: ReactNode;
  /** Account menu slot; defaults to a name + initials button. */
  accountMenu?: ReactNode;
}

function initials(user: SessionUser): string {
  return `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() || '?';
}

/** Zone-1, always platform-neutral (Cinder). Logo · search · notifications · account. */
export function TopBar({ user, alerts = [], onSelectAlert, onToggleRail, search, accountMenu }: TopBarProps) {
  return (
    <header className={styles.bar}>
      <button
        type="button"
        className={styles.menuToggle}
        aria-label="Toggle navigation"
        onClick={onToggleRail}
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <span className={cx(styles.logo, 'u-display-l')}>Training</span>

      {search ? <div className={styles.search}>{search}</div> : <div className={styles.spacer} />}

      <NotificationsBell alerts={alerts} onSelect={(a) => onSelectAlert?.(a)} />

      {accountMenu ?? (
        <button type="button" className={styles.account} aria-label={`Account: ${user.firstName} ${user.lastName}`}>
          <span className={styles.avatar} aria-hidden="true">
            {initials(user)}
          </span>
          <span className={styles.name}>{user.firstName}</span>
        </button>
      )}
    </header>
  );
}
