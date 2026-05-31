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
import App from './App';

// Restore the last-tuned context for returning users; enable refetch-on-focus/reconnect.
store.dispatch(hydrateContext());
setupListeners(store.dispatch);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
