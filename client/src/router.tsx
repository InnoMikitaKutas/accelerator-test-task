import { createBrowserRouter, Navigate } from 'react-router-dom';
import { authRoutes } from '@/pages/auth/routes';
import { RootIndex } from '@/pages/RootIndex';

/**
 * Minimal app router for Phase 3 — the public auth routes plus a "/" landing that
 * routes by session status. Phase 10.1 expands this into the full guarded data
 * router (RequireAuth/RequireRole/RequireVerified + every feature route).
 */
export const appRouter = createBrowserRouter(
  [
    { path: '/', element: <RootIndex /> },
    ...authRoutes,
    // Unknown paths fall back to "/", which redirects to /login when signed out.
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { future: { v7_relativeSplatPath: true } },
);
