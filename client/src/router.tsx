import { createBrowserRouter, Navigate } from 'react-router-dom';
import { authRoutes } from '@/pages/auth/routes';
import { RootIndex } from '@/pages/RootIndex';
import { UsersDirectory } from '@/pages/admin/UsersDirectory';
import { ProfileSettings } from '@/pages/ProfileSettings';
import { ShareLinksManager } from '@/pages/trainer/ShareLinksManager';
import { JoinLanding } from '@/pages/public/JoinLanding';

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
    // Profile & account settings — same role-shaped page under both nav labels
    // (trainer/coach → "Profile", player → "Account"). Phase 10.1 wraps these in the
    // shell layout + RequireAuth.
    { path: '/profile', element: <ProfileSettings /> },
    { path: '/account', element: <ProfileSettings /> },
    // Trainer ShareLinks manager (Phase 10.1 adds the role guard + shell layout).
    { path: '/sharelinks', element: <ShareLinksManager /> },
    // Public, trainer-branded join landing — register or associate (M1, L7).
    { path: '/join/:code', element: <JoinLanding /> },
    // Unknown paths fall back to "/", which redirects to /login when signed out.
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { future: { v7_relativeSplatPath: true } },
);
