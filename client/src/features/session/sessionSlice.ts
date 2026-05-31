import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { SessionUser } from '@/types/api';

export type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionState {
  user: SessionUser | null;
  status: SessionStatus;
}

const initialState: SessionState = { user: null, status: 'idle' };

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    loading(state) {
      state.status = 'loading';
    },
    set(state, action: PayloadAction<SessionUser>) {
      state.user = action.payload;
      state.status = 'authenticated';
    },
    // type === 'session/cleared' — baseQuery dispatches this raw on refresh failure.
    cleared(state) {
      state.user = null;
      state.status = 'unauthenticated';
    },
  },
});

export const {
  set: setSession,
  cleared: clearSession,
  loading: setSessionLoading,
} = sessionSlice.actions;

export default sessionSlice.reducer;
