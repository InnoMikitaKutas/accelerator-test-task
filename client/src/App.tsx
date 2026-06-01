import { RouterProvider } from 'react-router-dom';
import { ToastHost } from '@/components/ui/ToastHost';
import { VerifyEmailBanner } from '@/components/system/VerifyEmailBanner';
import { useSessionBootstrap } from '@/features/auth/useSessionBootstrap';
import { appRouter } from './router';

/**
 * App root: hydrate the session from GET /auth/me (3.1), then render the router.
 * The VerifyEmailBanner (L7) and ToastHost sit outside the router so they persist
 * across navigation — the banner shows on every route while a session is unverified
 * (e.g. straight after a /join registration). The role-aware AppShell composes into
 * the route tree in Phase 10.
 */
export default function App() {
  useSessionBootstrap();

  return (
    <>
      <VerifyEmailBanner />
      <RouterProvider router={appRouter} future={{ v7_startTransition: true }} />
      <ToastHost />
    </>
  );
}
