import {
  Users,
  UserCog,
  LayoutDashboard,
  Link2,
  CalendarClock,
  Palette,
  User,
  Eye,
  Radio,
  ClipboardList,
  History,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@/types/api';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Role-filtered rail nav (FR-008), per frontend-design-spec §App Shell. */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/impersonation', label: 'Impersonation log', icon: History },
  ],
  TRAINER: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/players', label: 'Players', icon: Users },
    { to: '/coaches', label: 'Coaches', icon: UserCog },
    { to: '/sharelinks', label: 'ShareLinks', icon: Link2 },
    { to: '/availability', label: 'Availability', icon: CalendarClock },
    { to: '/branding', label: 'Branding', icon: Palette },
    { to: '/profile', label: 'Profile', icon: User },
  ],
  COACH: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/my-times', label: 'My Times', icon: CalendarClock },
    { to: '/public-profile', label: 'Public profile', icon: Eye },
    { to: '/profile', label: 'Profile', icon: User },
  ],
  PLAYER: [
    { to: '/', label: 'Channel', icon: Radio },
    { to: '/family', label: 'Family', icon: Users },
    { to: '/approvals', label: 'Approvals', icon: ClipboardList },
    { to: '/best-times', label: 'Best Times', icon: CalendarClock },
    { to: '/account', label: 'Account', icon: User },
  ],
};
