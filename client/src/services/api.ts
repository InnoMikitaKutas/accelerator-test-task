import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

/**
 * Root RTK Query API. Feature endpoints are injected per-feature via
 * `api.injectEndpoints(...)` (Phases 3+) to keep code-splitting clean. The base
 * query handles credentials, CSRF, active-context, and 401 refresh (see baseQuery).
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'User',
    'Profile',
    'ShareLink',
    'Family',
    'Approval',
    'Availability',
    'Branding',
    'Context',
    'Impersonation',
    'Session',
  ],
  endpoints: () => ({}),
});
