# Training Platform — Client

React SPA for Epic-01 (User Management & Auth). Implements `specs/frontend-design-spec.md`
("Cinder & Chalk") against the contract in `specs/api-designer-spec.md`, aligned to the
TASK-002 backend fixes. Build order and rationale: `tasks/TASK-003/writing-plans-plan.md`.

> **Why `client/` and not `frontend/`?** Decision F-1 in the TASK-003 plan (user-confirmed),
> matching the `client/` paths in `Task/designs/DESIGN_TOKENS.md`. It is a sibling to `backend/`,
> so backend and frontend branches never collide.

## Tech stack

Vite 5 · React 18 · TypeScript 5 · Redux Toolkit + RTK Query · React Router v6 (data router) ·
react-hook-form + zod · CSS Modules + design-token CSS variables · Lucide icons ·
Archivo / Archivo Expanded / Spline Sans Mono (self-hosted via `@fontsource-variable`) ·
Vitest + React Testing Library + MSW · ESLint + Prettier.

## Prerequisites

- Node ≥ 20
- The Epic-01 backend (TASK-001 + TASK-002) running at `http://localhost:3000`.

## Setup

```bash
cp env.example .env
npm install
npm run dev          # http://localhost:5173
```

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server on a fixed `:5173` (allow-listed by backend `APP_BASE_URL`). |
| `npm run build` | Type-check (`tsc --noEmit`) then production build. |
| `npm run preview` | Serve the production build locally. |
| `npm run lint` | ESLint, zero warnings tolerated. |
| `npm run format` | Prettier write. |
| `npm test` | Vitest (run once). |
| `npm run test:watch` | Vitest watch mode. |

## Talking to the backend — two options (M5)

Auth is cookie-based (httpOnly `at`/`rt`/`csrf`), so the dev origin and the API must agree on cookies.

- **Option A (default):** `VITE_API_URL=http://localhost:3000/api/v1` — cross-origin. The backend
  must allow-list `http://localhost:5173` in its CORS `APP_BASE_URL` (it already does in
  `backend/env.example`) and send credentials.
- **Option B (dev proxy, no CORS):** set `VITE_API_URL=/api/v1`. Vite proxies `/api` and `/static`
  to `http://localhost:3000` (see `vite.config.ts`), so the browser sees one origin.

## Assets (C1)

User-uploaded logos/avatars are served from a (in prod, cookieless) asset origin,
`VITE_ASSET_BASE_URL`. The app renders `logoUrl`/`thumbnailUrl` from there via `<img src>` and
**never** inlines user SVG into the DOM.

## Testing

Vitest (jsdom) + React Testing Library + MSW. The MSW server is started in `src/test/setup.ts`
with `onUnhandledRequest: 'error'` — every test registers the handlers it needs via
`server.use(...)` (helpers in `src/test/handlers.ts`). Logic-heavy modules (baseQuery, slices,
error map, brand derivation, pure utils) are built test-first.

## Structure

```
src/
  app/          store, typed hooks
  services/     RTK Query api base, baseQuery, csrf, errorMap
  features/     feature slices + RTK Query endpoints (auth, users, …)
  components/   ui kit, shell, channel bar, system
  theme/        brand derivation + ThemeProvider
  lib/          framework-agnostic helpers (pagination, uploadGuard, slots)
  pages/        route screens
  styles/       tokens.css, global.css
  test/         setup, MSW server + handlers
```
