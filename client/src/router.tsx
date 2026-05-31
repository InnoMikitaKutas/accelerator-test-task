import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { authRoutes } from '@/pages/auth/routes';
import { RootIndex } from '@/pages/RootIndex';
import { UsersDirectory } from '@/pages/admin/UsersDirectory';
import { ImpersonationHistory } from '@/pages/admin/ImpersonationHistory';
import { ProfileSettings } from '@/pages/ProfileSettings';
import { ShareLinksManager } from '@/pages/trainer/ShareLinksManager';
import { TrainerAvailabilityView } from '@/components/availability/TrainerAvailabilityView';
import { BrandingSettings } from '@/pages/trainer/BrandingSettings';
import { JoinLanding } from '@/pages/public/JoinLanding';
import { FamilyRoster } from '@/pages/family/FamilyRoster';
import { Approvals } from '@/pages/family/Approvals';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { RequireRole } from '@/components/auth/RequireRole';

/**
 * App data router (Task 10.1).
 *
 * Public routes (auth screens + the branded /join landing) render bare. Everything
 * else lives under a single authenticated layout: RequireAuth (→ /login when signed
 * out; → forced-change when mustChangePassword) wraps the role-aware AppShell, whose
 * <Outlet/> renders the matched page. Per-page RequireRole bounces a wrong-role
 * principal to "/". Email verification is surfaced by the global VerifyEmailBanner
 * (the L7 soft path), not a hard route wall.
 *
 * Some rail-nav targets (dashboards, players/coaches, coach My-Times, player Best-Times)
 * belong to later epics; until those pages exist they fall through "*" → "/".
 */
export const appRouter = createBrowserRouter(
  [
    // ---- Public ----
    ...authRoutes, // /login, /verify-email, /forgot-password, /reset-password, /forced-password-change
    { path: '/join/:code', element: <JoinLanding /> },

    // ---- Authenticated (RequireAuth → AppShell) ----
    {
      element: (
        <RequireAuth>
          <AppShell>
            <Outlet />
          </AppShell>
        </RequireAuth>
      ),
      children: [
        { path: '/', element: <RootIndex /> },
        // Profile & account settings — same role-shaped page under both nav labels.
        { path: '/profile', element: <ProfileSettings /> },
        { path: '/account', element: <ProfileSettings /> },

        // Trainer
        {
          path: '/sharelinks',
          element: (
            <RequireRole roles={['TRAINER']}>
              <ShareLinksManager />
            </RequireRole>
          ),
        },
        {
          path: '/trainer/availability',
          element: (
            <RequireRole roles={['TRAINER']}>
              <TrainerAvailabilityView />
            </RequireRole>
          ),
        },
        {
          path: '/branding',
          element: (
            <RequireRole roles={['TRAINER']}>
              <BrandingSettings />
            </RequireRole>
          ),
        },

        // Super Admin
        {
          path: '/admin/users',
          element: (
            <RequireRole roles={['SUPER_ADMIN']}>
              <UsersDirectory />
            </RequireRole>
          ),
        },
        {
          path: '/admin/impersonation',
          element: (
            <RequireRole roles={['SUPER_ADMIN']}>
              <ImpersonationHistory />
            </RequireRole>
          ),
        },

        // Player / family (Zone-1, account-global)
        {
          path: '/family',
          element: (
            <RequireRole roles={['PLAYER']}>
              <FamilyRoster />
            </RequireRole>
          ),
        },
        {
          path: '/approvals',
          element: (
            <RequireRole roles={['PLAYER']}>
              <Approvals />
            </RequireRole>
          ),
        },
      ],
    },

    // Unknown paths → "/", which routes by session + role.
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { future: { v7_relativeSplatPath: true } },
);
