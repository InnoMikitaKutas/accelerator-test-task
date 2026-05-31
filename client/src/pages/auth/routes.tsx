import type { RouteObject } from 'react-router-dom';
import { Login } from './Login';
import { VerifyEmail } from './VerifyEmail';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
import { ForcedPasswordChange } from './ForcedPasswordChange';

/**
 * Public auth route definitions (Phase 3). Composed into the full data router by
 * Phase 10.1, which adds the RequireAuth / RequireRole / RequireVerified guards and
 * the rest of the route tree. `/forced-password-change` matches
 * FORCED_PASSWORD_CHANGE_ROUTE in services/errorMap.
 */
export const authRoutes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/forced-password-change', element: <ForcedPasswordChange /> },
];
