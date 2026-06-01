import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { ContextRef } from '@/types/api';

/**
 * The active `(subject × trainer)` context (F-5). Travels per request via the
 * X-Active-Context header (added by baseQuery, which reads `state.activeContext.current`).
 * Persisted to localStorage for returning users; the server default
 * (SessionUser.defaultContext) seeds fresh logins. `dirty` means the chosen default
 * still owes a PUT /me/contexts/default (cleared by markContextSynced on success).
 */

const STORAGE_KEY = 'activeContext';

export interface ActiveContextState {
  current: ContextRef | null;
  dirty: boolean;
}

function readPersisted(): ContextRef | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof (parsed as ContextRef).subjectProfileId === 'string' &&
      typeof (parsed as ContextRef).trainerId === 'string'
    ) {
      const { subjectProfileId, trainerId } = parsed as ContextRef;
      return { subjectProfileId, trainerId };
    }
    return null;
  } catch {
    return null;
  }
}

// Pragmatic side effect inside reducers: keep localStorage in lockstep with state
// so a switch survives reloads instantly (the plan's intended design for 1.3).
function persist(ref: ContextRef | null) {
  try {
    if (ref) localStorage.setItem(STORAGE_KEY, JSON.stringify(ref));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage unavailable / quota — non-fatal */
  }
}

const initialState: ActiveContextState = { current: null, dirty: false };

const activeContextSlice = createSlice({
  name: 'activeContext',
  initialState,
  reducers: {
    setContext(state, action: PayloadAction<ContextRef>) {
      state.current = action.payload;
      state.dirty = true;
      persist(action.payload);
    },
    clearContext(state) {
      state.current = null;
      state.dirty = false;
      persist(null);
    },
    hydrateContext(state) {
      state.current = readPersisted();
      state.dirty = false;
    },
    markContextSynced(state) {
      state.dirty = false;
    },
  },
});

export const { setContext, clearContext, hydrateContext, markContextSynced } =
  activeContextSlice.actions;

export default activeContextSlice.reducer;
