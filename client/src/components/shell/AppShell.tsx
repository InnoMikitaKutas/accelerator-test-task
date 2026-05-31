import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx } from '@/lib/cx';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setContext } from '@/features/context/activeContextSlice';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ChannelBar } from '@/components/channel/ChannelBar';
import { RailNav } from './RailNav';
import { TopBar } from './TopBar';
import type { NotificationAlert } from './NotificationsBell';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: ReactNode;
  alerts?: NotificationAlert[];
}

/**
 * Authenticated app frame: TopBar (Zone-1 neutral) + role-filtered RailNav + main.
 * The Channel Bar (2.5) and Impersonation banner (2.6) compose in here once built.
 */
export function AppShell({ children, alerts = [] }: AppShellProps) {
  const user = useAppSelector((s) => s.session.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [railOpen, setRailOpen] = useState(false);

  // Rendered only behind an authenticated route guard.
  if (!user) return null;

  const onSelectAlert = (alert: NotificationAlert) => {
    // Switch context, then deep-link — an alert list, never a merged view.
    dispatch(setContext(alert.context));
    if (alert.href) navigate(alert.href);
  };

  const isPlayer = user.role === 'PLAYER';

  return (
    <div className={cx(styles.shell, railOpen && styles.railOpen)}>
      <TopBar
        user={user}
        alerts={alerts}
        onSelectAlert={onSelectAlert}
        onToggleRail={() => setRailOpen((o) => !o)}
      />
      {/* Zone-3 + Channel Bar adopt the active trainer's brand; Zone-1 stays neutral. */}
      {isPlayer ? (
        <ThemeProvider>
          <ChannelBar />
        </ThemeProvider>
      ) : null}
      <div className={styles.body}>
        <RailNav role={user.role} />
        {isPlayer ? (
          <ThemeProvider className={styles.mainScope}>
            <main className={styles.main}>{children}</main>
          </ThemeProvider>
        ) : (
          <main className={styles.main}>{children}</main>
        )}
      </div>
    </div>
  );
}
