import reducer, { setSession, clearSession, setSessionLoading } from './sessionSlice';
import type { SessionUser } from '@/types/api';

const user: SessionUser = {
  id: 'u1',
  role: 'PLAYER',
  email: 'a@b.com',
  firstName: 'A',
  lastName: 'B',
  emailVerified: true,
  mustChangePassword: false,
  defaultContext: null,
};

describe('sessionSlice', () => {
  it('starts idle with no user', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ user: null, status: 'idle' });
  });

  it('set stores the user and authenticates', () => {
    const s = reducer(undefined, setSession(user));
    expect(s.user).toEqual(user);
    expect(s.status).toBe('authenticated');
  });

  it('cleared wipes the user (status unauthenticated)', () => {
    const authed = reducer(undefined, setSession(user));
    const s = reducer(authed, clearSession());
    expect(s.user).toBeNull();
    expect(s.status).toBe('unauthenticated');
  });

  it('exposes the exact session/cleared type that baseQuery dispatches', () => {
    expect(clearSession.type).toBe('session/cleared');
  });

  it('loading sets status', () => {
    expect(reducer(undefined, setSessionLoading()).status).toBe('loading');
  });
});
