/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const BACKEND = 'http://localhost:3000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Fixed port — MUST be present in the backend APP_BASE_URL allow-list (M5).
    // The backend env.example already sets APP_BASE_URL=http://localhost:5173.
    port: 5173,
    strictPort: true,
    // Option B (same-origin dev): set VITE_API_URL=/api/v1 to route through here
    // and sidestep CORS entirely. Harmless when using the default absolute URL.
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/static': { target: BACKEND, changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    css: true,
    clearMocks: true,
    restoreMocks: true,
    // Deterministic env for tests so baseQuery + MSW handlers agree on the base.
    env: {
      VITE_API_URL: 'http://localhost:3000/api/v1',
      VITE_ASSET_BASE_URL: 'http://localhost:3000/static',
    },
  },
});
