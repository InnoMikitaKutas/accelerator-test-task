# Epic-01 User Management & Authentication — Frontend Implementation Plan

**Task:** TASK-003

> **For Claude:** Use `using-git-worktrees` to create an isolated workspace, then implement with the `coder-frontend` skill. Work phase-by-phase, top to bottom — later phases assume earlier ones compile, pass, and render. Run `browser-verify` after each visible phase and `wcag-accessibility` on implemented components. Commit after every task.

**Goal:** Build the complete React frontend for the foundation epic — auth screens, the role-aware app shell + the signature **Channel Bar** context switcher, Super-Admin user management, profiles, ShareLinks/Join, parent–child family + purchase approvals, availability (Best Times / My Times), impersonation, and portal branding — against the contract in `specs/api-designer-spec.md`, the visual language in `specs/frontend-design-spec.md`, and **aligned to the backend behavior as changed by the TASK-002 fixes**.

**Architecture:** SPA (Vite + React + TypeScript) with **Redux Toolkit + RTK Query** for server cache and session/active-context slices. Auth is cookie-based (httpOnly `at`/`rt`/`csrf` — the client never reads tokens); the principal comes from `GET /auth/me`. A single `fetchBaseQuery` wrapper sends `credentials: 'include'`, echoes the `csrf` cookie as `X-CSRF-Token` on mutations, injects `X-Active-Context` on subject-scoped requests, and on `401` performs one `POST /auth/refresh` then retries. A `ThemeProvider` sets `--brand*` CSS variables from the active trainer's branding (contrast-safe derivation at runtime). The three-zone "no merged view" model is made visible by the Channel Bar re-theming when you tune into a trainer's channel. Full rationale: `specs/architect-architecture.md` + `specs/frontend-design-spec.md`.

**Tech Stack:** Vite · React 18 · TypeScript 5 · Redux Toolkit + RTK Query · React Router v6 (data router) · react-hook-form + zod (client validation) · CSS Modules + design-token CSS custom properties · Lucide icons · Archivo / Archivo Expanded / Spline Sans Mono · Vitest + React Testing Library + MSW (Mock Service Worker) · ESLint + Prettier.

---

## How to use this plan

- **Source-of-truth precedence** (AGENTS.md): Enforcement (hooks/CI) > Policy (AGENTS.md) > Specs (`specs/`) > this plan. If this plan contradicts a spec, the spec wins — fix the plan.
- **There was no prior frontend plan.** TASK-001 is backend-only; this plan is created from `specs/frontend-design-spec.md` (every section tagged `[TASK-001]`) + `specs/api-designer-spec.md`. It is the frontend sibling of `tasks/TASK-001/writing-plans-plan.md`.
- **DTOs / response shapes are not duplicated here.** The API spec already contains every DTO verbatim. Tasks say **"types mirror `specs/api-designer-spec.md` §…"** — generate TypeScript types from those shapes; add nothing the spec doesn't show.
- **Visual details are not restated.** Each component task says **"per `specs/frontend-design-spec.md` §…"** — colors, states, responsive, and a11y live there. This plan owns *build order, data flow, tests, and the TASK-002 fix integration*, not pixel values.
- **Business rules** are referenced by ID (FR-/BR-/NFR-) → look them up in `tasks/TASK-001/requirements-analyst-requirements.md`.
- **TDD where logic lives** (the base query, csrf/context/refresh wrappers, the ContextBouncer, the brand-contrast derivation, reducers/selectors, pure utils, the availability paint model): write the failing Vitest test first, implement, green, commit. Components: React Testing Library smoke + key-interaction tests with MSW; full visual confirmation via `browser-verify` at the end of each phase.
- **Commit granularity:** one commit per task using the message in the task. Never `--no-verify` (AGENTS.md).
- **All frontend code lives under `client/`** (sibling to `backend/`). There is no root `package.json`; run all commands from inside `client/`.

### Decisions locked for implementation (do not re-litigate)

| # | Decision | Where |
|---|----------|-------|
| F-1 | **Frontend dir = `client/`** (sibling to `backend/`; matches the `client/` paths in `Task/designs/DESIGN_TOKENS.md`). | this plan (user-confirmed) |
| F-2 | **Design language = "Cinder & Chalk"** from `specs/frontend-design-spec.md` (Archivo Expanded, graphite/chalk neutrals, crisp corners, hairline borders, shadows only on overlays). `Task/designs/DESIGN_TOKENS.md` (gradients/glows/rounded "PracticePerfect") is a **conflicting legacy artifact — do not follow it** for TASK-001. (Open Flag.) | frontend-design-spec |
| F-3 | **State = Redux Toolkit + RTK Query** (spec-locked). Server cache via RTK Query tags; `session` + `activeContext` as slices. No ad-hoc fetch in components. | frontend-design-spec §State |
| F-4 | **Tokens only in httpOnly cookies** — the client never reads `at`/`rt`. Principal = `GET /auth/me`. CSRF = read `csrf` cookie, echo `X-CSRF-Token` on every mutation. | api-spec global conventions; P-3 (TASK-001) |
| F-5 | **Active context travels per request** via `X-Active-Context: <subjectProfileId>:<trainerId>` — never persisted in a token. Switching is a full Zone-3 reload (re-tune), never a merged view (BR-005). | api-spec §Context; frontend-design-spec §Channel Bar |
| F-6 | **Children can log in** (constrained). `ChildMode` ships (no Zone-1, subject fixed to self, "Ask a grown-up" affordances). If product later disallows child login, drop ChildMode (Open Flag, P-5 mirror). | frontend-design-spec §ChildMode |
| F-7 | **Best Times = one shared schedule per child** (no per-trainer split). Built to swap to Zone-3/per-tab if the client flips the API flag (Open Flag, P-4 mirror). | frontend-design-spec §Availability |

### TASK-002 backend fixes → frontend impact (the "according to this fixes" contract)

These are the behaviors that changed in `tasks/TASK-002/writing-plans-plan.md`. Each is **baked into the phase noted** and called out inline with its finding ID.

| Finding | Backend change | Frontend obligation | Phase |
|---------|----------------|---------------------|-------|
| **C1** | SVG logos sanitized server-side; uploads served from a **cookieless asset origin** (`STORAGE_PUBLIC_BASE_URL`), images inline + `nosniff`, non-display uploads as `attachment`. | LogoUploader still accepts SVG. Render `logoUrl`/`thumbnailUrl` exactly as the API returns them (treat as a foreign origin — `VITE_ASSET_BASE_URL` documented). Never inline user SVG into the DOM; always via `<img src>`. | 0, 5, 9 |
| **H1** | Impersonation token now truly lives **1h** (was dying at 15min). | Banner countdown drives off the `expiresAt` from `POST /impersonate/:userId` (now a real 1h). On expiry the next call 401s → auth flow reverts to admin (see H2 handling). | 1, 2, 9 |
| **H2** | `deactivate` **revokes all sessions** immediately. | Global `401` handling: try one refresh; if it also fails (family revoked), hard-redirect to login with "Your session ended." UsersDirectory deactivate copy notes the user is signed out everywhere. | 1, 4 |
| **M1** | `/join` existing-user branch **rejects `unique`/coach links** with `VALIDATION_ERROR`. | JoinLanding authenticated branch detects `type:'unique'` and shows "Log out and create an account to redeem this coach invite" — **not** the subject-chooser. | 6 |
| **M3** | 48h approval **auto-deny is now persisted** (sweep) + parent notified. | PurchaseApprovals renders **server** `status:'EXPIRED'` as terminal; when a CountdownRing hits 0, invalidate the approvals tag to refetch (don't fake the terminal state client-side). | 7 |
| **M4** | Upload size capped at the **multer layer** (pre-buffering) → `413 FILE_TOO_LARGE`. | PhotoUploader/LogoUploader pre-validate ≤2MB client-side before POST; map `413` to an inline error. | 1, 5, 9 |
| **M5** | CORS now requires an **explicit origin allow-list** + credentials; CSRF unchanged. | `fetchBaseQuery` uses `credentials:'include'` + `X-CSRF-Token`; the Vite dev origin must be in backend `APP_BASE_URL` (documented; dev proxy provided). | 0, 1 |
| **L2** | DB CHECK enforces child `age ∈ [1,18]`. | AddChildFlow age stepper bounded 1–18 client-side (matches DTO + DB). | 7 |
| **L4** | Soft-deleted players excluded from availability reads. | Render only what the API returns (no client-side resurrection); no special UI. | 8 |
| **L5** | Override `reason` required + trimmed server-side. | ConflictOverrideModal: trim + non-empty gate before enabling Confirm. | 8 |
| **L6** | Cursor `createdAt` value validated server-side. | Treat `nextCursor` as **opaque** — DataTable "Load more" passes it back verbatim; never construct/parse a cursor. | 1 |
| **L3 / L7** | *Documented as intended* (no behavior change): login confirms creds for inactive accounts; `/join` register auto-logs-in while unverified. | Login maps `ACCOUNT_INACTIVE` vs `INVALID_CREDENTIALS` distinctly (per spec). Post-join, show a persistent "Verify your email" banner; scoped actions are blocked until verified, and logout → login is blocked until verified. | 3, 6 |

### Dependency graph (build order)

```
Phase 0  Scaffold & tooling (Vite/React/TS, RTK, Router, Vitest+RTL+MSW, ESLint/Prettier,
         design tokens + global CSS + fonts, env + dev proxy)                         ← M5, M7-env, C1-asset-url
Phase 1  API & cross-cutting layer (RTK Query baseQuery: credentials + CSRF +
         X-Active-Context + 401→refresh→retry; ContextBouncer; global errorCode→UX
         map; upload size guard; opaque-cursor pagination helper)        ← M5, M4, H2, H1, L6, C1
            │
Phase 2  Shared UI kit + App Shell + Channel Bar (signature) + ThemeProvider + Impersonation banner + Notifications bell  ← H1
            │
            ├─ Phase 3  Auth screens (Login, Verify, Forgot, Reset, ForcedChange)        ← L3/L7 copy
            ├─ Phase 4  Super-Admin Users (directory, create-trainer, edit, deactivate, GDPR)  ← H2
            ├─ Phase 5  Profiles & account settings (+ PhotoUploader)                    ← M4, C1
            ├─ Phase 6  ShareLinks manager (trainer) + JoinLanding (public, branded)     ← M1, L7
            ├─ Phase 7  Family / parent-child (roster, add-child, associations, approvals, ChildMode)  ← L2, M3
            ├─ Phase 8  Availability (weekly grid, trainer heatmap, override modal)      ← L4, L5
            └─ Phase 9  Impersonation (start/exit/history) + Portal Branding             ← H1, C1
Phase 10 Cross-cutting finalize: route guards, responsive pass, a11y sweep, browser-verify, e2e (MSW/Playwright), DoD
```

**Backend is assumed running** (Epic-01 backend from TASK-001 + TASK-002 fixes) at `VITE_API_URL` with `APP_BASE_URL` including the Vite dev origin.

---

## Phase 0 — Scaffold & tooling

Goal: a React app that boots, lints, tests, builds, and renders the design tokens — before any feature code.

**Files (create):** `client/package.json`, `vite.config.ts`, `tsconfig.json`, `.eslintrc.cjs`, `.prettierrc`, `index.html`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/global.css`, `src/test/setup.ts`, `src/test/server.ts` (MSW).

### Task 0.1: Initialize the Vite + React + TS project
- `npm create vite@latest client -- --template react-ts` (run from repo root), then `cd client && npm install`.
- Add deps: `@reduxjs/toolkit react-redux react-router-dom react-hook-form zod @hookform/resolvers lucide-react`.
- Add dev deps: `vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom msw @types/node`.
- Wire `package.json` scripts: `dev`, `build`, `preview`, `lint`, `format`, `test` (`vitest run`), `test:watch`.

**Verify:** `npm run dev` serves the Vite welcome; `npm run build` exits 0.
**Commit:** `chore(frontend): scaffold Vite + React + TS + RTK + Vitest`

### Task 0.2: Design tokens, fonts, and global CSS (Cinder & Chalk)
> Per `specs/frontend-design-spec.md` §Design System. **F-2: follow this spec, not `DESIGN_TOKENS.md`.**
- `src/styles/tokens.css`: `:root` with neutrals (`--bg`,`--surface`,`--surface-sunken`,`--line`,`--line-strong`,`--ink`,`--ink-2`,`--ink-3`), semantics (`--go`,`--pending`,`--foul`,`--info` + `-tint`/`-ink`), Cinder brand defaults (`--brand`,`--brand-text`,`--brand-ink`,`--brand-tint`,`--brand-line`), spacing (4px scale), radii (`--r-sm:3px`,`--r-md:6px`,`--r-pill:999px`), motion (`--ease-sprint`,`--ease-settle`,`--dur-1..3`,`--dur-load`), `--shadow-pop`. A `[data-theme="dark"]` block with the dark palette.
- Fonts: self-host Archivo, Archivo Expanded, Spline Sans Mono (`@font-face`); set `font-variant-numeric: tabular-nums` on data contexts.
- `prefers-color-scheme` → default `data-theme`; `prefers-reduced-motion` → disable wipe/stagger/glow.

**Verify:** a temporary swatch page renders the palette in light + dark.
**Commit:** `feat(frontend): Cinder & Chalk design tokens, fonts, global CSS`

### Task 0.3: Env, dev proxy, and the asset-origin contract
> **M5 / M7 / C1.**
- `.env.example`: `VITE_API_URL=http://localhost:3000/api/v1`, `VITE_ASSET_BASE_URL=http://localhost:3000/static` (C1: user-uploaded assets live on a — in prod, cookieless — origin; the app renders `logoUrl`/`thumbnailUrl` from here and never inlines SVG).
- `vite.config.ts`: dev server on a fixed port (e.g. 5173) **that must be in backend `APP_BASE_URL`** (M5); optional `/api` proxy for same-origin dev to sidestep CORS entirely. Document both options in `README`.
- `vitest` config: `environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']` (imports `@testing-library/jest-dom` + starts the MSW server).

**Commit:** `chore(frontend): env, dev proxy, MSW test harness (M5)`

---

## Phase 1 — API & cross-cutting layer

> The most important non-visual code in the epic. **TDD everything here.** Contract: `specs/api-designer-spec.md` global conventions + error catalog; `specs/frontend-design-spec.md` §State + §Shared (error→UX, ContextBouncer). Bakes in **M5, M4, H2, H1, L6, C1**.

**Files (create):** `src/app/store.ts`, `src/app/hooks.ts`, `src/features/session/sessionSlice.ts`, `src/features/context/activeContextSlice.ts`, `src/services/baseQuery.ts`, `src/services/api.ts` (empty `createApi` with tag types), `src/services/csrf.ts`, `src/services/errorMap.ts`, `src/components/system/ContextBouncer.tsx`, `src/lib/pagination.ts`, `src/lib/uploadGuard.ts`, plus `*.test.ts(x)` siblings.

### Task 1.1: CSRF token reader (TDD)
> **F-4.** Double-submit: read the non-httpOnly `csrf` cookie, send it as `X-CSRF-Token` on mutations.
**Test:** `getCsrfToken()` parses the `csrf` cookie from `document.cookie`; returns `undefined` when absent; URL-decodes the value.
**Implement:** tiny cookie parser in `csrf.ts`.
**Commit:** `feat(api): csrf cookie reader (F-4)`

### Task 1.2: `baseQuery` — credentials + CSRF + X-Active-Context + 401 refresh/retry (TDD)
> **M5, F-4, F-5, H1, H2.** This wraps `fetchBaseQuery`.
- `fetchBaseQuery({ baseUrl: VITE_API_URL, credentials: 'include', prepareHeaders })` — `prepareHeaders` adds `X-CSRF-Token` for non-GET, and `X-Active-Context: <subjectProfileId>:<trainerId>` from the `activeContext` slice **only** on subject-scoped endpoints (flagged per-endpoint via `extraOptions.scoped`).
- Wrap with a `baseQueryWithReauth`: on `401`, issue a single `POST /auth/refresh`; on success, retry the original; on failure (H1 expiry / **H2 revoked family**), dispatch `session/cleared` → the router sends the user to `/login` with a "Your session ended" notice. Guard against refresh storms (single-flight).

**Test (MSW):**
- mutation request carries `X-CSRF-Token` from the cookie; GET does not.
- scoped endpoint carries `X-Active-Context`; unscoped does not.
- `401` → one `refresh` → original retried once and succeeds.
- `401` then `refresh` also `401` → `session/cleared` dispatched, no infinite loop (**H2**).

**Commit:** `feat(api): base query with credentials, CSRF, active-context, single-flight 401 refresh (M5, H1, H2)`

### Task 1.3: `session` + `activeContext` slices (TDD)
> **F-3, F-5.** `session`: `{ user: SessionUserDto | null, status }`; reducers `set`, `cleared`. `activeContext`: `{ subjectProfileId, trainerId } | null`, persisted to `localStorage`, hydrated on boot; `setContext` also fires `PUT /me/contexts/default` (thunk).
**Test:** `cleared` wipes user; `setContext` writes localStorage + marks dirty; hydrate reads localStorage.
**Commit:** `feat(state): session + active-context slices (F-5)`

### Task 1.4: Global `errorCode → UX` map (TDD)
> Per frontend-design-spec §Shared "Global error→UX mapping" + api-spec error catalog. Pure function `mapError(errorCode, details?) → { kind: 'field'|'banner'|'toast'|'route'|'silent', ... }`.
**Test:** `VALIDATION_ERROR` → field errors from `details[]`; `CSRF_INVALID`/`UNAUTHENTICATED` → silent (handled by 1.2); `RATE_LIMITED` → banner + `Retry-After`; `FORCE_PASSWORD_CHANGE` → route `/forced-password-change`; `TENANT_FORBIDDEN`/`MINOR_FORBIDDEN` → friendly toast; `FILE_TOO_LARGE` (**M4**) → field error on the uploader; `CONTEXT_INACTIVE`/`CONTEXT_FORBIDDEN` → ContextBouncer.
**Commit:** `feat(api): central errorCode→UX mapping`

### Task 1.5: ContextBouncer (TDD)
> **F-5.** Global handler subscribed to RTK Query rejected actions: on `410 CONTEXT_INACTIVE` / `403 CONTEXT_FORBIDDEN`, toast "That connection was removed/unavailable" and auto-tune to a safe default context (or clear if none) — never leave a broken Zone-3.
**Test (RTL+MSW):** a scoped query returning `410` triggers a toast + `activeContext` reset to default.
**Commit:** `feat(context): ContextBouncer for 410/403 (F-5)`

### Task 1.6: Opaque-cursor pagination helper + client upload guard (TDD)
> **L6, M4.**
- `lib/pagination.ts`: `usePaginated(query)` accumulates pages and passes `nextCursor` **verbatim** as the next `cursor` arg — cursors are opaque tokens, never parsed/constructed (**L6**).
- `lib/uploadGuard.ts`: `validateImage(file, { maxBytes: 2*1024*1024, types })` → returns a `FILE_TOO_LARGE`/`UNSUPPORTED_FILE_TYPE`-shaped client error before any POST (**M4**), so the user gets instant feedback and we don't buffer-then-413.
**Test:** pagination passes cursor through unchanged + stops when `hasMore:false`; upload guard rejects >2MB and wrong type, accepts a valid small PNG.
**Commit:** `feat(api): opaque-cursor pagination + client upload size/type guard (L6, M4)`

### Task 1.7: Store assembly + Provider + RTK Query `api` base
Assemble `configureStore` (slices + `api.reducer` + `api.middleware`), `Provider` + typed hooks (`useAppDispatch`/`useAppSelector`), empty `createApi` with `tagTypes: ['User','Profile','ShareLink','Family','Approval','Availability','Branding','Context','Impersonation','Session']`.
**Commit:** `feat(app): store, provider, RTK Query api base`

---

## Phase 2 — Shared UI kit + App Shell + Channel Bar + Theming

> Build the reusable primitives first, then the shell that composes them, then the signature Channel Bar. Per `specs/frontend-design-spec.md` §Shared, §App Shell, §Channel Bar. **TDD the brand-contrast derivation and the context-switch logic; RTL-smoke the primitives.** Bakes in **H1** (banner).

**Files (create):** `src/components/ui/*` (StatusBadge, CountdownRing, DestructiveConfirm, Toast/ToastHost, DataTable, EmptyState, Skeleton, FormField, Modal, Sheet), `src/theme/brand.ts` (+ test), `src/theme/ThemeProvider.tsx`, `src/components/shell/{AppShell,RailNav,TopBar,NotificationsBell}.tsx`, `src/components/channel/ChannelBar.tsx`, `src/components/shell/ImpersonationBanner.tsx`.

### Task 2.1: Brand-contrast derivation (TDD)
> The central theming mechanism (FR-037). Pure module `brand.ts`: `deriveBrandVars(hex) → { brand, brandText, brandInk, brandTint, brandLine }`.
**Test:** dark brand → `--brand-ink: #FFFFFF`; light brand → `--brand-ink: --ink`; `--brand-text` is darkened until contrast vs `--surface` ≥ 4.5:1 (assert ratio); invalid hex → Cinder fallback.
**Implement:** luminance + WCAG contrast ratio; iterate L* down until AA.
**Commit:** `feat(theme): contrast-safe brand variable derivation (FR-037)`

### Task 2.2: ThemeProvider (zone↔theme rule)
> Sets `--brand*` on a scope element from the active trainer's branding (`GET /branding/:trainerId`, RTK Query, cached); platform **Cinder** for auth/Super-Admin/Zone-1; active trainer brand for Zone-3 + Channel Bar (per the spec's zone↔theme table). Recompute on context change. Missing/invalid → Cinder.
**Test (RTL+MSW):** switching active trainer updates the scoped `--brand` var; unbranded zones stay Cinder.
**Commit:** `feat(theme): ThemeProvider wires branding to CSS vars per zone`

### Task 2.3: Shared UI kit (RTL smoke each)
> Per §Shared table. Build: **StatusBadge** (semantic + `DELETED` strikethrough), **CountdownRing** (SVG ring + mono center, `pending`→`foul` thresholds, **SR text equivalent**, static on reduced-motion), **DestructiveConfirm** (`--foul`, consequence bullets, optional reason, type-to-confirm variant), **Toast/ToastHost** (`role=status|alert`, channel-label, auto-dismiss), **DataTable** (hairline rows, sticky header, row-busy, keyset "Load more" via `lib/pagination`, → card-stack <960px), **EmptyState**, **Skeleton** (chalk-sheen), **FormField** (label/input/helper/error, `aria-describedby`), **Modal**/**Sheet** (focus-trap + restore, ESC/scrim, → bottom-sheet mobile).
**Test:** each renders its states; CountdownRing exposes a non-animated text remaining; Modal traps + restores focus; DataTable "Load more" calls the pagination hook.
**Commit:** `feat(ui): shared component kit (badges, countdown, confirm, toast, table, modal, form)`

### Task 2.4: App Shell + role-aware RailNav + TopBar + NotificationsBell
> §App Shell. Rail nav **role-filtered** (FR-008) per the role→items table; TopBar always platform-neutral (Zone-1); NotificationsBell dropdown of channel-labeled alerts that **switch context** on click (not a merged view). Responsive: rail (240) / icon-rail (64) / mobile drawer.
**Test:** SUPER_ADMIN sees Users/Impersonation only; PLAYER sees Channel/Family/Approvals/Best Times/Account; bell click dispatches a context switch + deep-link.
**Commit:** `feat(shell): role-aware app shell, rail nav, top bar, notifications bell (FR-008)`

### Task 2.5: Channel Bar — the signature context switcher (TDD logic + RTL)
> ⭐ §Channel Bar (FR-019/027). Renders **only** for PLAYER/parent with ≥1 context (hidden when 1 subject + 1 trainer). Subject picker + trainer "lane" tabs (`role=tablist`, `aria-selected`); active tab = sliding 3px `--brand-line`; strip bg = active `--brand-tint`. Switching → **re-tune** transition + Zone-3 reload + new `X-Active-Context` + persist (localStorage + `PUT /me/contexts/default`) + `aria-live` announce. States: default/empty-subject ("Connect a coach")/just-joined (auto-tune)/`410` bounce/impersonating.
**Test:** tune-in updates `activeContext` + fires the default-context PUT + announces; "only one subject+trainer" → bar hidden; `410` on the active channel auto-tunes to default (via ContextBouncer).
**Commit:** `feat(channel): Channel Bar context switcher with re-tune + active-context wiring (FR-019/027)`

### Task 2.6: Impersonation banner — "Official mode" (H1)
> §Impersonation banner (FR-015). Sticky hazard stripe above everything; mono countdown to the **1h** hard expiry (**H1** — now a real hour), turns `--foul` under 5 min; **Exit** → `POST /impersonate/exit`. `role="alert"`, Exit is the first tab stop; 4px hazard inset frames the viewport.
**Test:** given an impersonation `expiresAt` ~1h out, the banner shows ~60:00 and counts down; reaching the threshold flips to `--foul`; Exit calls the mutation. (The actual expiry→401→revert path is covered by 1.2 + Phase 9.)
**Commit:** `feat(shell): impersonation hazard banner with 1h countdown (FR-015, H1)`

> **`browser-verify` checkpoint:** shell + Channel Bar re-tune + theming + banner across light/dark + breakpoints.

---

## Phase 3 — Auth screens

> §Auth Screens. Platform-Cinder, split layout. Public routes. Types/errors from api-spec §Module A. Bakes in **L3/L7** copy. TDD form logic; RTL+MSW for flows.

**Files (create):** `src/features/auth/api.ts` (RTK Query: login, logout, refresh, verifyEmail, resendVerification, forgotPassword, resetPassword, changePassword, me), `src/pages/auth/{Login,VerifyEmail,ForgotPassword,ResetPassword,ForcedPasswordChange}.tsx`, route definitions.

### Task 3.1: Auth API slice + `useMe` bootstrap
> `GET /auth/me` hydrates `session` on app load (F-4 — no token reading). Login/logout/refresh set/clear cookies server-side; bodies carry no tokens.
**Test (MSW):** `me` populates session; `logout` clears it; login success stores `SessionUserDto`.
**Commit:** `feat(auth): auth API slice + session bootstrap via /auth/me`

### Task 3.2: LoginForm (TDD error mapping — L3)
> §LoginForm. Fields email/password (show-hide)/remember; links to forgot + Join. Error mapping by `errorCode`: `INVALID_CREDENTIALS` → generic inline; `EMAIL_NOT_VERIFIED` (+`canResend`) → amber banner + Resend; **`ACCOUNT_INACTIVE` → distinct neutral banner** (**L3**: backend confirms creds for inactive — UI still shows a separate, non-credential message); `RATE_LIMITED` → disable + `Retry-After`. `mustChangePassword:true` → route to ForcedPasswordChange.
**Test:** each error code renders its mapped UI; success routes by role/`defaultContext`; inactive ≠ invalid-credentials copy.
**Commit:** `feat(auth): login form with full error-code mapping (FR-001, L3)`

### Task 3.3: Verify · Forgot · Reset · ForcedPasswordChange
> §VerifyEmail/Forgot/Reset/Forced. VerifyEmail auto-submits the link token (✓ / `TOKEN_EXPIRED`→Resend / `TOKEN_USED`→login). Forgot → **always** success (no enumeration, mirrors 202). Reset → new-password + strength meter + confirm; `TOKEN_EXPIRED/USED` → request-again. ForcedPasswordChange (FR-005) → new-password only, on success session rotates → dashboard.
**Test:** verify success + expired/used branches; forgot always-confirm; reset strength + token errors; forced-change rotates and lands on dashboard.
**Commit:** `feat(auth): verify-email, forgot, reset, forced-password-change`

> **`browser-verify` checkpoint:** auth split layout, states, mobile.

---

## Phase 4 — Super-Admin Users

> §Super Admin — Users. Platform-Cinder, ops-grade density. `@SUPER_ADMIN`. Types from api-spec §Module B. Bakes in **H2**.

**Files:** `src/features/users/api.ts` (list[keyset], get, createTrainer, update, deactivate, reactivate, gdprDelete, campImport), `src/pages/admin/UsersDirectory.tsx`, `src/components/admin/{CreateTrainerModal,EditUserDrawer,DeactivateConfirm,GdprDeleteModal,CampImportPanel}.tsx`.

### Task 4.1: UsersDirectory (DataTable + keyset + filters)
> §UsersDirectory (FR-010). Columns Name/Email/Role/Org/Status/Last-login/⋮; debounced search; Role/Status/Trainer filter chips; **"Load more"** keyset (NFR-002) with "Showing N of M"; status badges (`ACTIVE`/`INACTIVE` gray/`DELETED` strikethrough). Loading skeleton, empty, error, row-busy.
**Test (MSW):** renders rows; "Load more" appends via opaque cursor; filters/search refetch; badges by status.
**Commit:** `feat(users): admin directory with keyset pagination + filters (FR-010)`

### Task 4.2: CreateTrainerModal
> §CreateTrainerModal (FR-011). Account + Business sections + onboarding toggle (Invite vs Temp password, FR-005). `409 EMAIL_EXISTS` → email field error. Success → toast + prepend row with "Invited" pulse.
**Test:** validation; email-exists field error; success prepends row.
**Commit:** `feat(users): create-trainer modal (FR-011)`

### Task 4.3: Edit · Deactivate/Reactivate · GDPR-Delete (H2)
> §EditUser/Deactivate/GDPR. Two-tier destructive pattern. **Deactivate** (reversible) confirm copy explicitly states **"signs the user out of all sessions immediately"** (**H2**) and login is blocked; optimistic row→INACTIVE, reconcile on response. **GDPR delete** (irreversible) danger modal: consequence bullets + required `reason` + **type-to-confirm email** (matches `GdprDeleteDto.confirmEmail`) — primary disabled until match; post-delete → `DELETED` row style. CampImport = stubbed "Epic-08 preview" panel.
**Test:** deactivate confirm shows the sign-out copy + flips status; reactivate restores; GDPR primary stays disabled until the typed email matches; delete → DELETED style.
**Commit:** `feat(users): edit, deactivate (force-logout copy), reactivate, GDPR delete (FR-012/013/014, H2)`

> **`browser-verify` checkpoint:** directory density, badges, modals, card-stack <960px.

---

## Phase 5 — Profiles & account settings

> §Profiles. `GET/PATCH /me/profile`, role-shaped. Bakes in **M4, C1**.

**Files:** `src/features/profile/api.ts` (getMine, updateMine, uploadPhoto), `src/pages/ProfileSettings.tsx`, `src/components/upload/PhotoUploader.tsx`.

### Task 5.1: PhotoUploader (M4, C1) — shared uploader
> §ProfileSettings PhotoUploader. Drag/drop or pick (PNG/JPG ≤2MB); crop-to-square preview; **client guard via `lib/uploadGuard` before POST** (**M4**); on success shows the async-generated thumbnail from `thumbnailUrl` (rendered from `VITE_ASSET_BASE_URL`, **C1** — a foreign asset origin, via `<img>`). Errors: `413 FILE_TOO_LARGE` / `415 UNSUPPORTED_FILE_TYPE` inline.
**Test:** >2MB rejected client-side (no request fired); valid upload posts multipart + renders returned thumbnail; `413` → inline error.
**Commit:** `feat(profile): photo uploader with client size guard + async thumbnail (M4, C1)`

### Task 5.2: ProfileSettings (role-shaped)
> §ProfileSettings. Common (avatar/first/last/phone) + **read-only** chips for email/role/skillLevel (tooltip "managed by your trainer", FR-038); role blocks: Trainer business, Coach bio/credentials(tag input)/certifications/**public-visibility toggle** (FR-032) + "what others see" preview, Player gender/school/**emergency contact**. Dirty → sticky Save bar; saving/saved/error; optimistic where safe (NFR-003).
**Test (MSW):** role-shaped fields render from `details`; read-only fields not submitted; dirty/save/saved cycle; coach visibility toggle persists.
**Commit:** `feat(profile): role-shaped profile settings (FR-038, FR-032)`

> **`browser-verify` checkpoint:** uploader, role variants, dirty bar.

---

## Phase 6 — ShareLinks (trainer) + JoinLanding (public)

> §ShareLinks & Join + §Auth JoinLanding. Bakes in **M1, L7**. Types from api-spec §Module D.

**Files:** `src/features/sharelinks/api.ts` (list, createStatic, coachInvite, revoke, joinResolve, joinConsume), `src/pages/trainer/ShareLinksManager.tsx`, `src/pages/public/JoinLanding.tsx`.

### Task 6.1: ShareLinksManager (trainer)
> §ShareLinksManager (FR-033/028). Static player link card (big `mono` code, copy ✓, share URL, use-count `stat`, regenerate=danger-confirm). Coach invites list with status badges (`PENDING`/`ACCEPTED`/`EXPIRED`) + 7-day countdown + "Invite coach" form; revoke = `DELETE /sharelinks/:id`. Empty/generating/copied/expired-muted states.
**Test:** copy writes clipboard + ✓; invite create prepends PENDING; revoke mutes/removes.
**Commit:** `feat(sharelinks): trainer manager — static link + coach invites (FR-033/028)`

### Task 6.2: JoinLanding (public, trainer-branded) — M1 + L7
> §JoinLanding. `GET /join/:code` → **theme with the trainer's brand** (logo via `VITE_ASSET_BASE_URL`, `--brand` via ThemeProvider). Branch by `status`: `VALID`→form; `EXPIRED`/`USED`→friendly explainer; `INVALID`→not-found (never a raw 404).
> - **Unauthenticated:** `JoinRegisterDto` form (coach links pre-fill + **lock email**). On success the user is **auto-logged-in but unverified** → after redirect, show the persistent "Verify your email" banner (**L7**); scoped actions blocked until verified.
> - **Authenticated + `type:'static'`:** "Add this connection" subject chooser (self vs which child) → associate.
> - **Authenticated + `type:'unique'` (coach invite):** **M1** — backend now rejects this path. Show "This coach invite must be redeemed by creating a new account — log out and use the link" (no subject chooser, no silent player association).
> - **Child-blocked** (`403 MINOR_FORBIDDEN`): "Ask a parent to add this coach" + confirm parent emailed.
**Test (MSW):** branding themes the page; static authed → chooser → associate; **unique authed → the M1 logout-and-register message, no associate call**; register new → session set + verify banner shown (**L7**); minor → blocked copy.
**Commit:** `feat(join): branded join landing — register/associate, unique-link reject, verify banner (M1, L7)`

> **`browser-verify` checkpoint:** branded landing, all status/branch states, mobile.

---

## Phase 7 — Family / parent-child

> §Family. Zone-1, PLAYER/parent. Bakes in **L2, M3**. Types from api-spec §Module E.

**Files:** `src/features/family/api.ts` (roster, createChild, getChild, updateChild, addTrainer, removeTrainer, tokenSetting, purchaseRequest, approvals[list/get/approve/deny]), `src/pages/family/{FamilyRoster,Approvals}.tsx`, `src/components/family/{AddChildFlow,AssociationsManager,ApprovalCard,ChildModeShell}.tsx`.

### Task 7.1: FamilyRoster
> §FamilyRoster (FR-027). "Roster board": card per subject (Me + children) with avatar/name/age + trainer channels as lane-chips (tap → tune that channel) + "+ Add child" tile. Header `stat` = pending approvals (links to Approvals).
**Test:** renders self + children; chip tap switches context; pending count shows.
**Commit:** `feat(family): roster board with channel chips (FR-027)`

### Task 7.2: AddChildFlow (L2)
> §AddChildFlow (FR-021/022). Step 1: details (`CreateChildDto`) — **age stepper bounded 1–18 client-side** (**L2**, matches DB CHECK + DTO); `409 DUPLICATE_CHILD_WARNING` → inline + "Add anyway" (`confirmDuplicate:true`). Step 2: trainer selection — single-trainer confirm vs multi-trainer checklist (FR-022); skippable → "Connect a coach" empty state.
**Test:** age stepper clamps to 1–18; duplicate warning + add-anyway path; multi-trainer select associates.
**Commit:** `feat(family): add-child flow with 1–18 age guard + trainer select (FR-021/022, L2)`

### Task 7.3: AssociationsManager
> §AssociationsManager (FR-023). Per child: trainer connections + status; Add (code/pick) / Remove (danger-confirm warning it soft-deletes channel data + cancels upcoming RSVPs).
**Test:** add associates; remove shows the RSVP-cancel warning + soft-removes.
**Commit:** `feat(family): per-child associations manager (FR-023)`

### Task 7.4: PurchaseApprovals + CountdownRing (M3)
> §PurchaseApprovals (FR-024). Approval card: child+channel, item, amount (USD minor-units fmt or token), child note, **48h CountdownRing** (`pending`→`foul` <6h). Actions Approve/Deny (+ parent note). Per-child **TokenSetting** toggle (default off). Status states: `PENDING` (live ring) · `APPROVED` · `DENIED` · **`EXPIRED`** (filled `--foul`, "Auto-denied after 48h").
> **M3:** the server now persists `EXPIRED` (sweep). Render the **server** status as terminal; when a ring hits 0, **invalidate the `Approval` tag to refetch** and reflect the server's `EXPIRED` — do not synthesize the terminal state client-side. Acting too late → `410 APPROVAL_EXPIRED` → toast + refetch.
**Test (MSW):** PENDING shows live ring; approve/deny update; **ring-to-zero triggers refetch and shows server EXPIRED (M3)**; late action `410` → toast + state reconciles; token toggle persists.
**Commit:** `feat(family): purchase approvals with 48h ring + server-driven EXPIRED (FR-024, M3)`

### Task 7.5: ChildMode (F-6)
> §ChildMode (FR-025/026). Child logged in → no Zone-1, no subject switcher (fixed to self), only their trainer lane-tabs + Zone-3; larger targets, friendlier copy. Locked actions shown **disabled** with "Ask a grown-up"; purchase attempt → creates a `PENDING` approval (routes to parent) rather than hard-block; new-trainer link → "Ask a parent to add Coach {X}" blocked screen.
**Test:** minor session hides Zone-1 + switcher; locked action shows the affordance; purchase attempt creates an approval.
**Commit:** `feat(family): constrained ChildMode UI (FR-025/026)`

> **`browser-verify` checkpoint:** roster, approval ring states incl. EXPIRED, ChildMode.

---

## Phase 8 — Availability (Best Times / My Times)

> §Availability — signature data component. Bakes in **L4, L5**. Types from api-spec §Module F. **F-7: shared-per-child.**

**Files:** `src/features/availability/api.ts` (get/replace slots, trainerView, override), `src/components/availability/{WeeklyAvailabilityGrid,AvailabilityListMode,TrainerAvailabilityView,ConflictOverrideModal}.tsx`, `src/lib/slots.ts` (+ test).

### Task 8.1: Slot model + overlap logic (TDD)
> Pure `lib/slots.ts`: paint/merge/split ranges, detect overlaps, serialize to the `PUT` replacement set. The grid is a view over this model.
**Test:** painting merges adjacent ranges; overlap detection; serialize matches the replace-semantics payload.
**Commit:** `feat(availability): slot paint/merge/overlap model (TDD)`

### Task 8.2: WeeklyAvailabilityGrid (+ list-mode a11y fallback)
> §WeeklyAvailabilityGrid (FR-030/039). 7-day × time-row chalk grid; click-drag paint; click-edit popover; `PUT` full set (replace). Server-rejected overlaps → offending slots flash `--foul`. **A11y-critical:** arrow-key cell cursor, Space toggle, Shift+Arrow extend; **list-mode fallback is the primary SR path** (Add slot → day/start/end). <760px → day accordion.
**Test:** paint→save sends replacement set; server overlap rejection flashes; list-mode add/remove; keyboard paint path.
**Commit:** `feat(availability): weekly grid + accessible list-mode (FR-030/039)`

### Task 8.3: TrainerAvailabilityView (L4)
> §TrainerAvailabilityView (FR-034). Zone-3/org read-only heatmap: rows=players, cols=day/time buckets, intensity=count available; filter by day + "available at/after". Advisory framing (BR-012). **L4:** renders only players the API returns (soft-deleted excluded server-side) — no client filtering needed.
**Test:** heatmap renders from `trainerView`; filters narrow the list.
**Commit:** `feat(availability): trainer best-times heatmap + filters (FR-034)`

### Task 8.4: ConflictOverrideModal (L5)
> §ConflictOverrideModal (FR-031). Warning modal on assigning a coach against My-Times; override requires a **typed reason** — **trim + non-empty gate before enabling Confirm** (**L5**, matches server validation); Confirm → `POST /availability/overrides` + audit; Cancel keeps the conflict.
**Test:** whitespace-only reason keeps Confirm disabled (**L5**); valid reason posts the override.
**Commit:** `feat(availability): conflict override modal with required trimmed reason (FR-031, L5)`

> **`browser-verify` checkpoint:** grid paint + keyboard, heatmap, override modal.

---

## Phase 9 — Impersonation + Portal Branding

> §App Shell (impersonation) + §Portal Branding. Bakes in **H1, C1**. Types from api-spec §Modules G & H.

**Files:** `src/features/impersonation/api.ts` (start, exit, history), `src/pages/admin/ImpersonationHistory.tsx`, `src/features/branding/api.ts` (getOwn, setColor, uploadLogo, getByTrainer), `src/pages/trainer/BrandingSettings.tsx`, `src/components/upload/LogoUploader.tsx`.

### Task 9.1: Impersonation start/exit wiring (H1)
> §Impersonation banner (FR-015). Super-Admin "Impersonate" on a user → `POST /impersonate/:userId` → cookies re-issued for the target + banner mounts with the response `expiresAt` (**H1** — real 1h). Exit → `POST /impersonate/exit` → admin session restored. **On silent expiry**, the next request 401s → `baseQuery` refresh uses the admin's `rt` and reverts to admin (Task 1.2) — verify the banner unmounts and chrome restores.
**Test (MSW):** start mounts banner + switches principal; exit restores admin; a 401 after expiry reverts to admin and unmounts the banner (**H1**).
**Commit:** `feat(impersonation): start/exit wiring + 1h expiry revert (FR-015, H1)`

### Task 9.2: ImpersonationHistory (Super-Admin)
> §Super Admin. `GET /impersonation/history` — DataTable (admin, target, started, ended, duration in `mono`), keyset, date filters. Durations now populate correctly (TASK-002 H1 sweep closes abandoned logs).
**Test:** renders rows + keyset; date filter refetches.
**Commit:** `feat(impersonation): history report (FR-016)`

### Task 9.3: LogoUploader (C1, M4)
> §BrandingSettings LogoUploader. PNG/JPG/**SVG** ≤2MB (**C1**: SVG accepted — server sanitizes), ~200×200; client guard via `lib/uploadGuard` (**M4**); shows current + new preview; renders the stored `logoUrl` from `VITE_ASSET_BASE_URL` via `<img>` (**C1** — foreign asset origin; never inline the SVG markup into the DOM). Errors `413`/`415` inline.
**Test:** SVG ≤2MB accepted + posted; >2MB rejected client-side; preview renders from returned `logoUrl`.
**Commit:** `feat(branding): logo uploader (SVG ok, client size guard, foreign-origin render) (FR-037, C1, M4)`

### Task 9.4: BrandingSettings (live preview)
> §BrandingSettings (FR-037). Color picker (validate `^#[0-9A-Fa-f]{6}$`) + swatch + eyedropper; on change the **preview pane re-themes instantly** (`deriveBrandVars` from Task 2.1) with a **contrast read-out** warning when text must darken; live miniature player-portal preview (Channel Bar + card + button + badge); Reset to Cinder + Apply org-wide. Clean/dirty/saving/saved/error.
**Test:** invalid hex blocked; valid hex re-themes preview + shows contrast read-out; save persists + invalidates the `Branding` tag (players re-theme on next resolve).
**Commit:** `feat(branding): live-preview branding settings with contrast read-out (FR-037)`

> **`browser-verify` checkpoint:** impersonation banner lifecycle, branding live preview + AA read-out.

---

## Phase 10 — Cross-cutting finalize & verification

### Task 10.1: Routing + guards
Data-router routes for all pages; a `RequireAuth` loader (redirect to `/login` when `session.user` null), `RequireRole`, `RequireVerified` (mirrors backend `EmailVerifiedGuard` — surfaces the L7 verify banner instead of a hard wall where the spec allows), `mustChangePassword` → forced-change. Public routes: `/login`, `/join/:code`, verify/forgot/reset.
**Commit:** `feat(routing): data router + auth/role/verified guards`

### Task 10.2: Responsive + reduced-motion pass
Walk every phase's breakpoints (sm/md/lg/xl per §Responsive); confirm Channel Bar sheet <600px, tables → card-stack <960px, availability → day accordion <760px, modals → bottom-sheet; honor `prefers-reduced-motion`.
**Commit:** `style(frontend): responsive + reduced-motion pass`

### Task 10.3: Accessibility sweep
Run the `wcag-accessibility` skill on Channel Bar, DataTable, Modal, the availability grid + list-mode, CountdownRing, forms. Fix focus order, `aria-live` announcements, contrast (brand derivation), 44px targets (NFR-009/010).
**Commit:** `fix(a11y): WCAG 2.1 AA sweep across interactive components`

### Task 10.4: End-to-end happy paths (MSW or Playwright)
Cover: login→dashboard; Super-Admin create-trainer + deactivate (**H2** sign-out copy); join-register→verify-banner (**L7**); join authed unique→reject (**M1**); add-child(1–18)→approval→**ring-zero refetch EXPIRED** (**L2, M3**); availability paint→save→override(reason) (**L5**); impersonate→expire→revert (**H1**); branding color→preview→save.
**Commit:** `test(e2e): Epic-01 happy paths incl. TASK-002 fix behaviors`

### Task 10.5: Definition of Done sweep
`npm run lint && npm run build && npm run test` green; `browser-verify` clean (no console errors) on every page; the TASK-002 fixes table above all verified in-app; update `specs/frontend-design-spec.md` "Open Design Flags" if any were resolved.
**Commit:** `chore(frontend): DoD sweep — lint/build/test/browser-verify green`

---

## Verification matrix (TASK-002 fix → where proven)

| Finding | Proven in |
|---------|-----------|
| C1 (SVG ok, foreign-origin render) | 5.1, 9.3 + browser-verify |
| H1 (1h banner + expiry revert) | 1.2, 2.6, 9.1 + 10.4 |
| H2 (force-logout on deactivate) | 1.2, 4.3 + 10.4 |
| M1 (unique-link reject) | 6.2 + 10.4 |
| M3 (server-driven EXPIRED) | 7.4 + 10.4 |
| M4 (client size guard + 413) | 1.6, 5.1, 9.3 |
| M5 (credentials + CSRF + origin) | 0.3, 1.2 |
| L2 (age 1–18) | 7.2 |
| L4 (soft-deleted excluded) | 8.3 |
| L5 (trimmed required reason) | 8.4 |
| L6 (opaque cursor) | 1.6, 4.1 |
| L3 / L7 (intended-behavior copy) | 3.2, 6.2 |

## Open flags (surface to client; do not silently resolve)

| Flag | Impact |
|------|--------|
| **Design-token source conflict (F-2)** | `Task/designs/DESIGN_TOKENS.md` ("PracticePerfect": gradients/glows/rounded) contradicts `specs/frontend-design-spec.md` ("Cinder & Chalk"). This plan follows the spec. Confirm before any styling that references DESIGN_TOKENS.md is reintroduced. |
| **Styling engine** | CSS Modules + token CSS vars chosen (clean fit for runtime brand-var theming). Tailwind is the alternative DESIGN_TOKENS.md assumed — switching is a Phase-0/2 re-skin. |
| **Best Times scoping (F-7)** | Built shared-per-child; per-coach moves the grid into Zone-3/per-tab. |
| **Child login UX (F-6)** | ChildMode assumes children log in; drop it + "Ask a grown-up" if product disallows. |
| **Aesthetic direction / default Cinder #E14817 / dark-mode default** | Per frontend-design-spec Open Flags — committed choices; a different vibe re-skins the token layer. |

---

## Execution

- Implement with `coder-frontend`, phase by phase. After each visible phase run `browser-verify`; on interactive components run `wcag-accessibility`.
- Keep the backend (TASK-001 + TASK-002) running at `VITE_API_URL`; ensure its `APP_BASE_URL` includes the Vite dev origin (**M5**), or use the dev proxy.
- One commit per task; never `--no-verify`.

## Next Steps

- **Architecture sanity check (optional):** `/architect` `TASK-003` — review the baseQuery refresh single-flight + the zone↔theme ThemeProvider boundary before Phase 2.
- **Pass to implementation:** `/git-worktrees` `TASK-003` to isolate, then `/coder-frontend` `TASK-003`.
- Keep the **TASK-002 fixes table** as the acceptance checklist — every row must be demonstrable in-app before the PR.
