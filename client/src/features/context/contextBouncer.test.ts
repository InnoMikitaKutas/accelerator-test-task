import { configureStore } from '@reduxjs/toolkit';
import type { ContextRef, SessionUser } from '@/types/api';
import { contextBouncerMiddleware } from './contextBouncer';
import activeContext, { setContext } from './activeContextSlice';
import session, { setSession } from '@/features/session/sessionSlice';
import toasts from '@/features/toasts/toastsSlice';

const baseUser: SessionUser = {
  id: 'u1',
  role: 'PLAYER',
  email: 'p@x.com',
  firstName: 'P',
  lastName: 'X',
  emailVerified: true,
  mustChangePassword: false,
};

const broken: ContextRef = { subjectProfileId: 'sub-broken', trainerId: 'tr-x' };
const fallback: ContextRef = { subjectProfileId: 'sub-1', trainerId: 'tr-9' };

function makeStore() {
  return configureStore({
    reducer: { activeContext, session, toasts },
    middleware: (getDefault) => getDefault().prepend(contextBouncerMiddleware.middleware),
  });
}

/** A synthetic RTK Query rejected-with-value action carrying an errorCode. */
function rejected(errorCode: string) {
  return {
    type: 'api/executeQuery/rejected',
    payload: { status: errorCode === 'CONTEXT_FORBIDDEN' ? 403 : 410, data: { errorCode } },
    error: { message: 'Rejected' },
    meta: { rejectedWithValue: true, requestStatus: 'rejected', requestId: 'r1', arg: {} },
  };
}

describe('contextBouncer', () => {
  it('on CONTEXT_INACTIVE: toasts and auto-tunes to the user default', () => {
    const store = makeStore();
    store.dispatch(setSession({ ...baseUser, defaultContext: fallback }));
    store.dispatch(setContext(broken));

    store.dispatch(rejected('CONTEXT_INACTIVE'));

    expect(store.getState().toasts.items).toHaveLength(1);
    expect(store.getState().activeContext.current).toEqual(fallback);
    expect(store.getState().activeContext.dirty).toBe(false); // markContextSynced
  });

  it('on CONTEXT_FORBIDDEN with no default: toasts and clears the context', () => {
    const store = makeStore();
    store.dispatch(setSession({ ...baseUser, defaultContext: null }));
    store.dispatch(setContext(broken));

    store.dispatch(rejected('CONTEXT_FORBIDDEN'));

    expect(store.getState().toasts.items[0].tone).toBe('info');
    expect(store.getState().activeContext.current).toBeNull();
  });

  it('clears when the default IS the broken context (cannot tune back to it)', () => {
    const store = makeStore();
    store.dispatch(setSession({ ...baseUser, defaultContext: broken }));
    store.dispatch(setContext(broken));

    store.dispatch(rejected('CONTEXT_INACTIVE'));

    expect(store.getState().activeContext.current).toBeNull();
  });

  it('ignores unrelated rejected actions', () => {
    const store = makeStore();
    store.dispatch(setContext(fallback));

    store.dispatch(rejected('VALIDATION_ERROR'));

    expect(store.getState().toasts.items).toHaveLength(0);
    expect(store.getState().activeContext.current).toEqual(fallback);
  });
});
