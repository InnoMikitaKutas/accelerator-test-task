import { configureStore } from '@reduxjs/toolkit';
import { api } from '@/services/api';
import sessionReducer from '@/features/session/sessionSlice';
import activeContextReducer from '@/features/context/activeContextSlice';
import toastsReducer from '@/features/toasts/toastsSlice';
import { contextBouncerMiddleware } from '@/features/context/contextBouncer';

const reducer = {
  session: sessionReducer,
  activeContext: activeContextReducer,
  toasts: toastsReducer,
  [api.reducerPath]: api.reducer,
};

/** Factory so tests get an isolated store; the app uses the `store` singleton below.
 *  Tests set up state by dispatching slice actions after construction. */
export function makeStore() {
  return configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      // Listener (ContextBouncer) before the RTK Query middleware.
      getDefaultMiddleware().prepend(contextBouncerMiddleware.middleware).concat(api.middleware),
  });
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
