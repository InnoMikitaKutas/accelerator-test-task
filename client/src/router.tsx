import { createBrowserRouter, Navigate } from 'react-router-dom';
import { authRoutes } from '@/pages/auth/routes';
import { RootIndex } from '@/pages/RootIndex';
import { UsersDirectory } from '@/pages/admin/UsersDirectory';

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
    // Unknown paths fall back to "/", which redirects to /login when signed out.
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { future: { v7_relativeSplatPath: true } },
);
