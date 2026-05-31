import { RouterProvider } from 'react-router-dom';
import { ToastHost } from '@/components/ui/ToastHost';
import { useSessionBootstrap } from '@/features/auth/useSessionBootstrap';
import { appRouter } from './router';

/**
 * App root: hydrate the session from GET /auth/me (3.1), then render the router.
 * ToastHost sits above the routes so toasts (e.g. the ContextBouncer's) survive
 * navigation. The role-aware AppShell composes into the route tree in Phase 10.
 */
export default function App() {
  useSessionBootstrap();

  return (
    <>
      <RouterProvider router={appRouter} future={{ v7_startTransition: true }} />
      <ToastHost />
    </>
  );
}
