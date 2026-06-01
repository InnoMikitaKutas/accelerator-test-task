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

// --- Request AbortSignal strip ---
// On Node 25, undici (via @mswjs/interceptors) rejects the AbortSignal that
// fetchBaseQuery attaches to its Request — even a valid one. Tests don't exercise
// request abortion, so wrap the (MSW-proxied) Request constructor to drop `signal`.
// This is a test-harness shim only; the production fetch keeps its signal.
let originalRequest: typeof Request;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  originalRequest = globalThis.Request;
  const stripped = new Proxy(originalRequest, {
    construct(target, args) {
      const [input, init] = args as [RequestInfo | URL, RequestInit | undefined];
      if (init && typeof init === 'object' && 'signal' in init) {
        const { signal: _signal, ...rest } = init;
        return Reflect.construct(target, [input, rest]);
      }
      return Reflect.construct(target, args);
    },
  });
  Object.defineProperty(globalThis, 'Request', { value: stripped, configurable: true, writable: true });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  Object.defineProperty(globalThis, 'Request', {
    value: originalRequest,
    configurable: true,
    writable: true,
  });
  server.close();
});
