import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import type { RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from '@/app/store';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: AppStore;
}

/** Render a component wrapped in a Redux Provider with an isolated store. */
export function renderWithProviders(
  ui: ReactElement,
  { store = makeStore(), ...options }: ProviderOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }
  return { store, ...render(ui, { wrapper: Wrapper, ...options }) };
}

export * from '@testing-library/react';
