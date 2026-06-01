import { useState } from 'react';
import { Bell } from 'lucide-react';
import { cx } from '@/lib/cx';
import { CountdownRing } from '@/components/ui/CountdownRing';
import type { ContextRef } from '@/types/api';
import styles from './NotificationsBell.module.css';

export interface NotificationAlert {
  id: string;
  /** Human message, e.g. "Liam · Coach Jones — approval needed". */
  message: string;
  /** The (subject × trainer) this alert belongs to (never a merged view). */
  channelLabel: string;
  /** Context to switch into when the alert is clicked. */
  context: ContextRef;
  /** Optional deep-link to the item within that channel. */
  href?: string;
  unread?: boolean;
  /** Pending-approval alerts show a mini 48h countdown. */
  expiresAt?: string;
}

export interface NotificationsBellProps {
  alerts: NotificationAlert[];
  onSelect: (alert: NotificationAlert) => void;
}

/** Zone-1 cross-context alerts. Clicking an alert switches context + deep-links —
 *  an alert list, not a merged view (compliant with BR-005). */
export function NotificationsBell({ alerts, onSelect }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const unread = alerts.filter((a) => a.unread).length;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.bell}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 ? <span className={styles.dot} aria-hidden="true" /> : null}
      </button>

      {open ? (
        <div className={styles.menu} role="menu">
          {alerts.length === 0 ? (
            <p className={styles.empty}>No notifications.</p>
          ) : (
            alerts.map((a) => (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  onSelect(a);
                  setOpen(false);
                }}
              >
                <span className={styles.text}>
                  <span className={cx(styles.channel, 'u-label')}>{a.channelLabel}</span>
                  <span className={styles.message}>{a.message}</span>
                </span>
                {a.expiresAt ? (
                  <CountdownRing
                    expiresAt={a.expiresAt}
                    totalMs={48 * 3600_000}
                    foulThresholdMs={6 * 3600_000}
                    size={34}
                  />
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
