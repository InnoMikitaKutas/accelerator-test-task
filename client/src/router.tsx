import { createBrowserRouter, Navigate } from 'react-router-dom';
import { authRoutes } from '@/pages/auth/routes';
import { RootIndex } from '@/pages/RootIndex';
import { UsersDirectory } from '@/pages/admin/UsersDirectory';
import { ImpersonationHistory } from '@/pages/admin/ImpersonationHistory';
import { ProfileSettings } from '@/pages/ProfileSettings';
import { ShareLinksManager } from '@/pages/trainer/ShareLinksManager';
import { TrainerAvailabilityView } from '@/components/availability/TrainerAvailabilityView';
import { JoinLanding } from '@/pages/public/JoinLanding';
import { FamilyRoster } from '@/pages/family/FamilyRoster';
import { Approvals } from '@/pages/family/Approvals';

/**
 * Minimal app router for Phases 3–4 — the public auth routes, the Super-Admin users
 * directory, plus a "/" landing that routes by session status. Phase 10.1 expands
 * this into the full guarded data router (RequireAuth/RequireRole/RequireVerified +
 * every feature route); the role guard on /admin/* lands there.
 */
export const appRouter = createBrowserRouter(
  [
    { path: '/', element: <RootIndex /> },
    ...authRoutes,
    { path: '/admin/users', element: <UsersDirectory /> },
    // Super-Admin impersonation audit log (FR-016). Phase 10.1 adds the role guard.
    { path: '/admin/impersonation', element: <ImpersonationHistory /> },
    // Profile & account settings — same role-shaped page under both nav labels
    // (trainer/coach → "Profile", player → "Account"). Phase 10.1 wraps these in the
    // shell layout + RequireAuth.
    { path: '/profile', element: <ProfileSettings /> },
    { path: '/account', element: <ProfileSettings /> },
    // Trainer ShareLinks manager (Phase 10.1 adds the role guard + shell layout).
    { path: '/sharelinks', element: <ShareLinksManager /> },
    // Trainer Best-Times heatmap — read-only player availability (FR-034). Self-contained
    // view component; Phase 10.1 adds the TRAINER role guard + shell layout.
    { path: '/trainer/availability', element: <TrainerAvailabilityView /> },
    // Public, trainer-branded join landing — register or associate (M1, L7).
    { path: '/join/:code', element: <JoinLanding /> },
    // Family / parent-child (Zone-1, PLAYER) — roster + approvals. Phase 10.1 adds guards.
    { path: '/family', element: <FamilyRoster /> },
    { path: '/approvals', element: <Approvals /> },
    // Unknown paths fall back to "/", which redirects to /login when signed out.
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { future: { v7_relativeSplatPath: true } },
);
