import { makeStore } from './store';
import { api } from '@/services/api';
import { clearSession, setSession } from '@/features/session/sessionSlice';
import type { SessionUser } from '@/types/api';

const user: SessionUser = {
  id: 'u1',
  role: 'SUPER_ADMIN',
  email: 'a@b.com',
  firstName: 'A',
  lastName: 'B',
  emailVerified: true,
  mustChangePassword: false,
};

describe('store', () => {
  it('wires the session, activeContext, toasts, and RTK Query reducers', () => {
    const state = makeStore().getState();
    expect(state).toHaveProperty('session');
    expect(state).toHaveProperty('activeContext');
    expect(state).toHaveProperty('toasts');
    expect(state).toHaveProperty(api.reducerPath);
  });

  it('processes session actions through the real store', () => {
    const store = makeStore();
    store.dispatch(setSession(user));
    expect(store.getState().session.user?.id).toBe('u1');
    store.dispatch(clearSession());
    expect(store.getState().session.user).toBeNull();
  });
});
