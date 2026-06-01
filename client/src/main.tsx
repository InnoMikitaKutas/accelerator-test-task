import '@fontsource-variable/archivo/standard.css'; // weight + width axes
import '@fontsource-variable/spline-sans-mono';
import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { setupListeners } from '@reduxjs/toolkit/query';
import { store } from './app/store';
import { hydrateContext } from './features/context/activeContextSlice';
import { ensureCsrfToken } from './services/csrf';
import App from './App';

// Restore the last-tuned context for returning users; enable refetch-on-focus/reconnect.
store.dispatch(hydrateContext());
setupListeners(store.dispatch);
// Warm the CSRF token from GET /auth/csrf so the first mutation (e.g. login) doesn't
// pay an extra round-trip; baseQuery also lazily ensures it, so this is best-effort.
void ensureCsrfToken();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
