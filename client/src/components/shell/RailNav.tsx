import { NavLink } from 'react-router-dom';
import { cx } from '@/lib/cx';
import type { Role } from '@/types/api';
import { NAV_BY_ROLE } from './nav';
import styles from './RailNav.module.css';

export interface RailNavProps {
  role: Role;
  /** Icon-only rail (64px). */
  collapsed?: boolean;
}

/** Role-filtered left rail (FR-008). Active item carries the brand lane-indicator. */
export function RailNav({ role, collapsed }: RailNavProps) {
  const items = NAV_BY_ROLE[role] ?? [];
  return (
    <nav className={cx(styles.rail, collapsed && styles.collapsed)} aria-label="Primary">
      <ul>
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) => cx(styles.link, isActive && styles.active)}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} aria-hidden="true" className={styles.icon} />
              <span className={styles.label}>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
