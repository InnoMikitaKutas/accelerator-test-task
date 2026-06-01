import { createSlice, nanoid } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Tone } from '@/services/errorMap';

/** Transient notifications rendered by ToastHost (2.3). `channelLabel` tags an alert
 *  with the (subject × trainer) it belongs to — never a merged view. */
export interface Toast {
  id: string;
  tone: Tone;
  message: string;
  channelLabel?: string;
  /** Auto-dismiss after N ms; 0/undefined = sticky until dismissed. */
  durationMs?: number;
}

export type ToastInput = Omit<Toast, 'id'>;

export interface ToastsState {
  items: Toast[];
}

const initialState: ToastsState = { items: [] };

const toastsSlice = createSlice({
  name: 'toasts',
  initialState,
  reducers: {
    pushToast: {
      reducer(state, action: PayloadAction<Toast>) {
        state.items.push(action.payload);
      },
      // id generated in `prepare` so the reducer stays pure.
      prepare(input: ToastInput) {
        return { payload: { id: nanoid(), ...input } };
      },
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.items = state.items.filter((t) => t.id !== action.payload);
    },
    clearToasts(state) {
      state.items = [];
    },
  },
});

export const { pushToast, dismissToast, clearToasts } = toastsSlice.actions;
export default toastsSlice.reducer;
