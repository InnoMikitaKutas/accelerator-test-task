import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import type { RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { makeStore, type AppStore } from '@/app/store';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: AppStore;
  /** Initial router history entries (default ['/']). */
  initialEntries?: string[];
}

/** Render a component wrapped in a Redux Provider (isolated store) + a MemoryRouter. */
export function renderWithProviders(
  ui: ReactElement,
  { store = makeStore(), initialEntries = ['/'], ...options }: ProviderOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter
          initialEntries={initialEntries}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          {children}
        </MemoryRouter>
      </Provider>
    );
  }
  return { store, ...render(ui, { wrapper: Wrapper, ...options }) };
}

export * from '@testing-library/react';
