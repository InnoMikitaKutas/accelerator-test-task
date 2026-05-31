import { createListenerMiddleware, isRejectedWithValue } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { ContextRef } from '@/types/api';
import { pushToast } from '@/features/toasts/toastsSlice';
import { clearContext, markContextSynced, setContext } from './activeContextSlice';

/**
 * Global handler (F-5): when any RTK Query request fails with 410 CONTEXT_INACTIVE
 * or 403 CONTEXT_FORBIDDEN — an association removed or revoked mid-session — toast
 * the user and auto-tune to a safe default context (or clear it). Never leave a
 * broken Zone-3 on screen.
 */

const BOUNCE_CODES = new Set(['CONTEXT_INACTIVE', 'CONTEXT_FORBIDDEN']);

interface BouncerState {
  activeContext?: { current: ContextRef | null };
  session?: { user?: { defaultContext?: ContextRef | null } | null };
}

function sameContext(a: ContextRef, b: ContextRef): boolean {
  return a.subjectProfileId === b.subjectProfileId && a.trainerId === b.trainerId;
}

function errorCodeOf(payload: unknown): string | undefined {
  const err = payload as FetchBaseQueryError | undefined;
  return (err?.data as { errorCode?: string } | undefined)?.errorCode;
}

export const contextBouncerMiddleware = createListenerMiddleware();

contextBouncerMiddleware.startListening({
  matcher: isRejectedWithValue,
  effect: (action, api) => {
    const code = errorCodeOf(action.payload);
    if (!code || !BOUNCE_CODES.has(code)) return;

    api.dispatch(
      pushToast({
        tone: 'info',
        message: 'That connection is no longer available.',
        durationMs: 6000,
      }),
    );

    const state = api.getState() as BouncerState;
    const broken = state.activeContext?.current ?? null;
    const fallback = state.session?.user?.defaultContext ?? null;

    // Auto-tune to the user's default if it's a different, usable channel; else clear.
    if (fallback && !(broken && sameContext(fallback, broken))) {
      api.dispatch(setContext(fallback));
      api.dispatch(markContextSynced()); // the server already holds this default
    } else {
      api.dispatch(clearContext());
    }
  },
});
