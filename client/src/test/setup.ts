import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// --- Web Storage shim ---
// Node 25 exposes an experimental global localStorage that needs --localstorage-file
// and whose .clear() is unavailable here, shadowing jsdom's. Install a predictable
// in-memory Storage so app code and tests get real Web Storage semantics.
function installMemoryStorage(key: 'localStorage' | 'sessionStorage') {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => store.delete(k) as unknown as void,
    setItem: (k, v) => void store.set(k, String(v)),
  };
  Object.defineProperty(globalThis, key, { value: storage, configurable: true, writable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, key, { value: storage, configurable: true, writable: true });
  }
}
installMemoryStorage('localStorage');
installMemoryStorage('sessionStorage');

// MSW lifecycle. onUnhandledRequest:'error' makes a missing mock fail the test
// loudly instead of leaking to the real network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
