# Frontend Design — Training Platform

UI/UX design system and component specs. **Read `MANIFEST.md` → `architect-architecture.md` →
`api-designer-spec.md` first.** This file owns the visual language, the per-trainer theming
mechanism, and component specs (visual + states + responsive + a11y). It references API `errorCode`s
and the three data zones rather than restating them.

> **Scope:** TASK-001 (Epic-01) — every screen in the epic. Components are organized by feature;
> all inherit the Design System below. Routine forms not spec'd individually inherit form/field/validation
> patterns from §Shared.

---

## [TASK-001] Aesthetic Direction — "Cinder & Chalk" (2026-05-29)

**Direction:** *Athletic Performance Editorial.* The interface borrows the visual language of track &
field and sports-broadcast graphics — **chalk-line structure, graphite ink, a cinder-track accent,
expanded-grotesque mastheads, and tabular "scoreboard" numerals** — executed with editorial discipline.
Confident and kinetic, but precise and trustworthy: this tool handles children's data, training
schedules, and money, so energy never tips into noise.

### Why this direction (rationale)

1. **Domain fit.** The product is athletic coaching — *players, coaches, skill levels, Best Times,
   RSVPs to training events*. A performance-dashboard / broadcast aesthetic is native to it, not
   decorative.
2. **The branding constraint shapes the identity.** FR-037 lets every trainer set their own
   `primaryColorHex` that themes their players' portal. **The accent is therefore a variable** — so the
   memorable identity is built from *type, structure, spacing, and motion*, with color as a swappable
   token. This is a feature, not a limitation: the chrome visibly **re-themes when you tune into a
   trainer's channel**, reinforcing the "separated views" model (BR-005) you can *see*.
3. **Data-dense, not marketing.** 10k-row directories, weekly availability grids, approval queues,
   audit logs. The system favors hairline structure + tabular figures over hero imagery.

### Anti-slop commitments

No Inter/Roboto/system fonts · no purple→blue gradients on white · no rounded-rect-with-soft-shadow
everywhere (we use **crisp corners + chalk-line borders + flat surfaces**; shadows reserved for true
overlays) · no generic card grids — layout uses **lane structure and editorial hierarchy**.

### Memorable element — **The Channel Bar**

A persistent, scoreboard-style strip that always names the exact `(subject × trainer)` **channel** you
are tuned to. Switching subject + sliding across trainer "lane" tabs animates a **chalk lane-indicator**
between tabs, and the workspace performs a crisp **"re-tune" wipe** (a fast horizontal chalk sweep +
staggered content reveal). It is the one thing people remember, *and* it solves the highest-risk UX in
the epic — it makes "this is a full context reload, never a merged view" legible at a glance. When you
tune into a channel, the Channel Bar (and Zone-3 accents) adopt that trainer's brand color; the global
account layer above it stays platform-neutral.

---

## [TASK-001] Design System (2026-05-29)

### Typography

Open-source superfamily for cohesion; an expanded cut supplies the athletic-masthead character.

| Role | Font | Usage |
|------|------|-------|
| Display / masthead / stat numbers | **Archivo Expanded** (700/800) | Page titles, big stat/scoreboard numerals, section labels (UPPERCASE, tracked). The signature voice. |
| Body / UI / forms / tables | **Archivo** (400/500/600) | All interface text, inputs, table cells, paragraphs. Set `font-variant-numeric: tabular-nums` on all numeric/data contexts. |
| Mono | **Spline Sans Mono** (400/500) | ShareLink codes, UUIDs/refs, timestamps in audit/impersonation logs, the 48h countdown digits. |

**Type scale** (base 16px / 1rem; display uses ~1.25 ratio):

| Token | px (desktop → mobile) | Font / weight | Notes |
|-------|----------------------|---------------|-------|
| `display-xl` | 44 → 32 | Archivo Expanded 800 | page masthead |
| `display-l` | 30 → 26 | Archivo Expanded 700 | section header |
| `stat` | 36–56 | Archivo Expanded 800, tabular | scoreboard numbers (counts, durations) |
| `h1`–`h3` | 28 / 22 / 18 | Archivo 600 | content headings |
| `body-l` / `body` / `body-s` | 17 / 15 / 13 | Archivo 400–500 | `body` (15) is UI default |
| `label` | 11–12 | Archivo 600, UPPERCASE, `letter-spacing: 0.10em` | "event-board" labels, table headers, field labels |
| `mono` | 13–14 | Spline Sans Mono 500 | codes, timestamps |

Line-height: 1.15 for display, 1.5 for body. Headings use `letter-spacing: -0.01em`; tracked labels
`+0.10em`.

### Color & Theming

**The neutral structural base is fixed; the brand accent is variable.** Status colors are independent
of brand (never tie semantic meaning to a token a trainer can recolor).

**Graphite / Chalk neutrals** (cool-tinted):

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--bg` | `#F1F3F4` | `#0E1116` | page ("chalk dust" / "stadium night") |
| `--surface` | `#FFFFFF` | `#161A21` | cards, tables, modals |
| `--surface-sunken` | `#E9ECEE` | `#10141A` | wells, grid backs |
| `--line` | `#D5D9DD` | `#272D37` | hairline "chalk line" borders |
| `--line-strong` | `#AEB5BD` | `#3A424E` | dividers, input borders |
| `--ink` | `#10141A` | `#EEF1F4` | primary text |
| `--ink-2` | `#444C57` | `#AEB7C2` | secondary text |
| `--ink-3` | `#737C87` | `#7A828E` | tertiary / placeholder |

**Semantic** (brand-independent):

| Token | Hex | Use |
|-------|-----|-----|
| `--go` | `#1E8E55` | Active status, success, "available" slots |
| `--pending` | `#C77D11` | Pending approvals, warnings, 48h countdown (normal) |
| `--foul` | `#C8362B` | Destructive (deactivate, GDPR delete), errors, countdown <6h |
| `--info` | `#2D6CA2` | Informational toasts/badges |

Each has `-tint` (12% alpha) and `-ink` (AA-safe text) derivations.

**Default platform brand — "Cinder"** (cinder-track orange; used wherever no trainer theme applies):

```
--brand:        #E14817;   /* raw — fills, lane-indicator, large/decorative */
--brand-text:   #BE3A10;   /* AA-safe (≥4.5:1 on --surface) for links/icons/text on neutral */
--brand-ink:    #FFFFFF;   /* readable foreground ON a --brand fill */
--brand-tint:   rgba(225,72,23,0.10);  /* hover/selected backgrounds */
--brand-line:   #E14817;   /* active borders, the channel lane-indicator */
```

#### Per-trainer theming contract (FR-037) — the central mechanism

The app sets `--brand` from the active trainer's `primaryColorHex` (`GET /branding/:trainerId`,
cached). Because trainers pick arbitrary colors, **derive contrast-safe variants at runtime** so WCAG
AA holds for any input:

- `--brand-ink` → `#FFFFFF` if `luminance(brand) < 0.45`, else `--ink` (readable text on a brand fill).
- `--brand-text` → start from `brand`; darken (reduce L*) until contrast vs `--surface` ≥ **4.5:1**.
  Used for any brand-colored **text/icon/link** on neutral surfaces. (Raw `--brand` is only for fills,
  ≥24px decorative marks, and the lane-indicator — never small text.)
- `--brand-tint` → `brand` at 10% alpha.
- Missing/invalid branding → fall back to **Cinder** defaults above.

**Where branding applies (and the zone↔theme rule):**

| Surface | Theme |
|---------|-------|
| Auth screens (login, verify, reset, forced-change) | **Platform Cinder** (unbranded) |
| **Join landing** for a specific trainer link | **That trainer's brand** (first-impression branding) |
| Super Admin (all of Module B, impersonation history) | **Platform Cinder** |
| Zone-1 global account layer (top bar, notifications bell, family roster, account settings) | **Platform Cinder** |
| Zone-3 per-context workspace + the Channel Bar when tuned in | **Active trainer's brand** |
| Trainer's own dashboards / branding preview | **Their own brand** |

→ You can *see* which layer you're in: the neutral account chrome vs. the brand-tinted channel. This is
the visual expression of the three-zone / no-merged-view model.

**Dark mode:** both palettes shipped; respects `prefers-color-scheme`. The broadcast aesthetic
("scoreboard glow") reads strongly in dark — Channel Bar, stat numbers, and the availability grid get a
subtle accent glow in dark only.

### Spacing, grid, shape

- **Spacing scale** (4px base): 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96.
- **Layout grid:** 12-col, max content width 1280px; app shell = fixed left rail (240px, collapsible to
  64px icon-rail) + fluid main. Generous gutters (24–32px).
- **Radius:** crisp — `--r-sm: 3px` (inputs, chips), `--r-md: 6px` (cards, modals), `--r-pill: 999px`
  (status badges, lane-indicator, avatars). No blanket rounding.
- **Borders = the primary separator** ("chalk lines"): 1px `--line` hairlines; **2–3px `--brand-line`
  "lane line"** marks active tabs/selection/section leads. Surfaces are flat and tonal.
- **Shadows reserved for overlays only:** `--shadow-pop: 0 8px 28px -8px rgba(16,20,26,0.28)` for
  modals/menus/toasts. No ambient shadows on cards.

### Motion

```
--ease-sprint:  cubic-bezier(0.2, 0.8, 0.2, 1);   /* decisive — most transitions */
--ease-settle:  cubic-bezier(0.16, 1, 0.3, 1);    /* overshoot-free settle — reveals */
--dur-1: 120ms;  --dur-2: 180ms;  --dur-3: 260ms;  --dur-load: 400ms;
```

- **Signature — "re-tune" (context switch):** `--dur-3` chalk-wipe sweep left→right across the Zone-3
  workspace + staggered (24ms) upward-8px fade-in of cards/rows; lane-indicator slides between tabs
  with `--ease-sprint`. Announces a full reload.
- **Page load orchestration:** masthead → stat row → table/cards reveal, staggered 24ms, total ≤ `--dur-load`.
- **Micro:** button press (translateY 1px + `--brand-line` underline), tab hover (lane-indicator
  grows from center), countdown ring tick (1s linear), toast slide-in from top-right, skeleton "chalk
  sheen" shimmer.
- **`prefers-reduced-motion`:** disable wipe/stagger/glow; switches and reveals become instant; keep
  only opacity ≤120ms.

### Iconography & imagery

- **Icons:** a single crisp line set (1.5px stroke, square-ish corners to echo the editorial geometry)
  — e.g. Lucide. No filled/duotone mixing.
- **Imagery:** product is data, not photos. Avatars (user/child/coach photos, FR-038) are the only
  imagery — rendered as `--r-pill` with a 1px `--line` ring; fallback = monogram on a brand-tint disc.
- **Decorative motif:** faint **lane/chalk-line** texture allowed on empty states and the auth/join
  split panel only (very low contrast) — never behind dense data.

### Accessibility baseline (NFR-009, WCAG 2.1 AA)

Repo has a `wcag-accessibility` skill — run it on implemented components. Baseline here:
- Contrast: body text ≥4.5:1, large/UI ≥3:1; `--brand-text` derivation guarantees AA for brand text.
- **Visible focus:** 2px `--ink` ring + 2px offset (3px `--brand-line` ring inside branded zones).
- Full keyboard paths for the Channel Bar, tabs, data tables, modals (focus trap + restore), and the
  availability paint grid (see §Availability).
- Screen-reader: context switch announces via `aria-live=polite` — *"Now viewing Emma with Coach Smith."*
  Countdown exposes a non-animated text equivalent.
- Touch targets ≥44×44px (NFR-010); forms label-associated; errors `aria-describedby` the field.

---

## [TASK-001] App Shell & Navigation (2026-05-29)

### Role-aware shell

Left rail (240px) + top bar + main. Rail nav is **role-filtered** (FR-008):

| Role | Rail items |
|------|-----------|
| SUPER_ADMIN | Users · Impersonation log · (platform settings) |
| TRAINER | Dashboard · Players · Coaches · ShareLinks · Availability · Branding · Profile |
| COACH | Dashboard · My Times · Public profile · Profile |
| PLAYER/parent | Channel workspace · Family · Approvals · Best Times · Account |

Top bar (Zone-1, always platform-neutral): logo lockup · global search (Super Admin/Trainer) ·
**notifications bell** · account menu. **States:** rail expanded / icon-rail (64px) / mobile drawer.

### The Channel Bar — context switcher ⭐ (FR-019/027) — *memorable element*

Renders **only for PLAYER/parent** with ≥1 context (progressive disclosure: 1 subject + 1 trainer →
hidden entirely). Sits directly under the top bar, above the Zone-3 workspace.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ◐ Tuned to                                                            │
│  [ Emma ▾ ]   ▌Coach Smith▐   Coach Lee        ● live · 2 RSVPs        │  ← brand-tinted strip
│   subject       └ lane-indicator slides between trainer tabs           │
└──────────────────────────────────────────────────────────────────────┘
```

- **Left:** subject picker (account-style dropdown — *Me (Dana)*, *Emma*, *Liam*; avatars + role tag).
  Hidden when only one subject (child sessions: always hidden, subject fixed to self).
- **Right of subject:** **trainer "lane" tabs** for the chosen subject; active tab carries the 3px
  `--brand-line` lane-indicator that **slides** on change. Strip background = active trainer `--brand-tint`.
- **Switching** triggers the **re-tune** transition and reloads Zone-3; sends the new `X-Active-Context`
  header on subsequent requests; persists to localStorage + `PUT /me/contexts/default`.
- **States:**
  - *Default / hover / active-tab* (lane-indicator).
  - *Empty subject* — child added, no coach yet: tabs replaced by a "Connect a coach" prompt (no Zone-3).
  - *Just joined a channel* (post `POST /join/:code`): new tab animates in + auto-tunes to it.
  - *`410 CONTEXT_INACTIVE` bounce* — association removed mid-session: toast *"That connection was
    removed,"* auto-tune to a safe default; never show a broken Zone-3.
  - *Impersonating a parent* (Super Admin): identical switcher, wrapped by the hazard banner.
- **Responsive:** desktop = inline tabs; <900px = subject dropdown + a horizontally scrollable tab row;
  <600px = single "Channel ▾" button opening a full-screen sheet (subject list → trainer list).
- **A11y:** `role="tablist"` for trainer lanes (`aria-selected`), subject = labeled menu;
  `aria-live` announcement on tune; lane-indicator is decorative (`aria-hidden`).

### Impersonation banner — "Official mode" (FR-015)

Unmistakable **hazard stripe** (amber `#F2B705` + `--ink` diagonal caution pattern — a treatment used
*nowhere else*, evoking a referee/official overseeing play). Full-width, **sticky at the very top**,
above everything including the top bar.

`⚠ OFFICIAL VIEW — you are acting as **Jordan Lee (Player)** · started 14:02 · auto-exit in [58:31] · [ Exit ]`

- Countdown (mono) ticks to the 1h hard expiry; turns `--foul` under 5 min.
- **Exit** → `POST /impersonate/exit`, hazard recedes (wipe up), admin chrome restored.
- A 4px hazard inset frames the whole viewport while active. **A11y:** `role="alert"`, focusable Exit
  is the first tab stop.

### Notifications bell (Zone-1, cross-context alerts — D-E)

Dropdown of channel-labeled alerts — *"Liam · Coach Jones — approval needed."* Clicking an alert
**switches context** into that channel and deep-links the item (compliant: an alert list, not a merged
view). Unread = `--brand-text` dot. Pending-approval alerts show a mini 48h countdown.

---

## [TASK-001] Auth Screens (2026-05-29)

Platform-Cinder, unbranded (except join landing). **Layout:** split — left = brand panel with faint
lane-chalk motif + a rotating "stat" line (`stat` type); right = the form on `--surface`. Single-column
on mobile (panel collapses to a slim masthead). Orchestrated load: masthead → fields → CTA.

### [TASK-001] LoginForm
- Fields: email, password (show/hide), "remember me," links to forgot + "have an invite? Join."
- **States:** default · focused (input gets `--brand-line` underline-grow) · loading (CTA → inline
  spinner) · error.
- **Error mapping (by `errorCode`):**
  - `INVALID_CREDENTIALS` → inline form error, generic ("Email or password is incorrect").
  - `EMAIL_NOT_VERIFIED` → amber banner + **"Resend verification"** action (`canResend`).
  - `ACCOUNT_INACTIVE` → neutral banner, support hint.
  - `RATE_LIMITED` → disable CTA, countdown from `Retry-After`.
- On `mustChangePassword:true` → route to **ForcedPasswordChange** (cannot reach app).

### [TASK-001] JoinLanding (`GET /join/:code`) — **trainer-branded**
The first thing a new player/parent sees → **themed with the trainer's brand** (logo + `--brand`).
- Resolves the link: shows trainer name/logo and a "You're joining **{Trainer}**" hero.
- **By `status`:** `VALID` → register/associate form; `EXPIRED`/`USED` → friendly explainer + "ask your
  trainer for a new link"; `INVALID` → not-found state. (Never a raw 404.)
- **Branch UI:** unauthenticated → `JoinRegisterDto` form (coach links pre-fill + lock email);
  authenticated → "Add this connection" with a subject choose (self vs which child) → creates association.
- **Child-blocked** (`403 MINOR_FORBIDDEN`): gentle "Ask a parent to add this coach" + confirmation the
  parent was emailed.

### [TASK-001] VerifyEmail · ForgotPassword · ResetPassword · ForcedPasswordChange
- **VerifyEmail:** token auto-submitted from the email link → success (✓, CTA to login) / `TOKEN_EXPIRED`
  → "Resend" / `TOKEN_USED` → "Already verified, log in."
- **ForgotPassword:** email field → **always** success confirmation (no enumeration; mirrors 202).
- **ResetPassword:** new-password + strength meter + confirm; `TOKEN_EXPIRED/USED` → request-again state.
- **ForcedPasswordChange (FR-005):** post-temp-password gate; new password only (no current);
  explains why; on success rotates session → dashboard.

---

## [TASK-001] Super Admin — Users (2026-05-29)

Platform-Cinder. Operations-grade density.

### [TASK-001] UsersDirectory (FR-010)
- **Data table** on `--surface`: columns Name (avatar+monogram) · Email · Role · Org/Trainer · Status
  (badge) · Last login (mono) · ⋮ actions. Tabular figures; zebra via 1px `--line`, no shadows.
- **Toolbar:** global search (debounced) · filters (Role, Status, Trainer org) as dismissible chips ·
  result count as a `stat`.
- **Keyset pagination → "Load more"** button + count ("Showing 50 of 10,000"), *not* numbered pages
  (matches cursor API, NFR-002). Infinite-scroll optional with the same cursor.
- **Status badges:** `ACTIVE` `--go` · `INACTIVE` `--ink-3` (grayed, FR-013) · `DELETED` `--foul-tint`
  with strikethrough name "Deleted User" (FR-014).
- **States:** loading (skeleton rows w/ chalk-sheen) · empty/no-results · error (retry) · row-busy.
- **Responsive:** <960px table → stacked cards (Name + status lead, details as label/value rows).

### [TASK-001] CreateTrainerModal (FR-011)
- Sections: Account (email, first/last, phone) · Business (businessName, address) · Onboarding mode
  toggle — **Invite email** vs **Temp password** (FR-005). Live inline validation; `409 EMAIL_EXISTS`
  → field-level error on email.
- Success → toast + new row prepended with an "Invited" pulse.

### [TASK-001] EditUser · Deactivate / Reactivate · GDPR-Delete (FR-012/013/014)
- **Destructive-confirm pattern** (shared, §Shared): two tiers —
  - *Deactivate* (reversible): standard confirm; explains history is kept, login blocked.
  - *GDPR delete* (irreversible): **danger modal** — `--foul` header, bulleted consequences (PII
    anonymized, analytics totals kept, "Deleted User" in history), a **required `reason`**, and a
    **type-to-confirm email** field (mirrors `GdprDeleteDto.confirmEmail`). Primary button stays
    disabled until the typed email matches. Post-delete: row → `DELETED` style.
- **Camp import (FR-040):** a minimal stubbed panel labeled "Epic-08 — preview"; not primary nav.

---

## [TASK-001] Profiles & Account Settings (2026-05-29)

`GET/PATCH /me/profile`. Role-shaped (`ProfileResponseDto.details`). Two-column on desktop (nav +
panel), single-column mobile.

### [TASK-001] ProfileSettings
- **Common:** avatar (photo uploader), first/last, phone. **Read-only display** for `email`, `role`,
  `skillLevel` (rendered as locked chips with a tooltip "managed by your trainer / not editable" — FR-038).
- **Role blocks:** Trainer → business fields; Coach → bio, credentials (tag input), certifications,
  **public-profile visibility toggle** (FR-032) with a "what others see" preview; Player → gender,
  school, **emergency contact**.
- **PhotoUploader:** drag/drop or pick (PNG/JPG ≤2MB); crop-to-square preview; on upload shows the
  generated thumbnail when ready (async). Errors: `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE` →
  inline.
- **States:** clean · dirty (sticky "Save changes" bar) · saving · saved (✓ flash) · field error.
  Save < 1s target (NFR-003) — optimistic where safe.

---

## [TASK-001] ShareLinks & Join (2026-05-29) — Trainer side

### [TASK-001] ShareLinksManager (FR-033/028)
- Two zones: **Player link (static)** — a single persistent card showing the code (`mono`, big), a
  **copy** button (copied ✓ micro), the share URL, and lifetime use-count as a `stat`; regenerate =
  danger-confirm (invalidates old).
- **Coach invites (unique)** — list with status badges: `PENDING` `--pending` · `ACCEPTED` `--go` ·
  `EXPIRED` `--ink-3`; each shows target email + 7-day expiry countdown; **"Invite coach"** opens a
  small form (email + note). Revoke = `DELETE /sharelinks/:id`.
- **States:** empty (no invites) · generating · copied · expired rows muted.

*(JoinLanding lives in §Auth — it's the public, trainer-branded counterpart.)*

---

## [TASK-001] Family / Parent-Child (2026-05-29)

Zone-1 (global, platform-neutral). PLAYER/parent only.

### [TASK-001] FamilyRoster (FR-027) — `GET /family`
- **"Roster board"**: a card per subject — **Me** + each child — styled like a team sheet. Each card:
  avatar/monogram, name, age, and the child's **trainer channels** as small lane-chips (tap → tune into
  that channel). A "+ Add player/child" tile.
- Header `stat`: pending approvals count (links to Approvals).

### [TASK-001] AddChildFlow (FR-021/022)
- Step 1: child details (`CreateChildDto` — name, age 1–18 stepper, gender, optional school).
  `409 DUPLICATE_CHILD_WARNING` → inline "You already have a child with this name & age" + **"Add anyway"**
  (resends `confirmDuplicate:true`).
- Step 2: **trainer selection** — *single-trainer prompt* (one trainer org → one confirm) **vs.
  multi-trainer checklist** (FR-022). Can skip → child shows "Connect a coach" empty state.

### [TASK-001] AssociationsManager (FR-023)
- Per child: list of trainer connections with status; **Add** (via code or pick) /
  **Remove** (danger-confirm: warns it soft-deletes that channel's data + **cancels upcoming RSVPs**).

### [TASK-001] PurchaseApprovals (FR-024) — *signature micro-component: the 48h countdown*
- **Approval card:** child + channel label, item, amount (USD minor-units formatted, or token), child's
  note, and a **48h countdown ring** (`pending` → `foul` under 6h; mono digits in the center). Actions:
  **Approve** / **Deny** (+ optional parent note).
- States: `PENDING` (live ring) · `APPROVED` `--go` · `DENIED` `--ink-3` · **`EXPIRED`** (ring filled
  `--foul`, "Auto-denied after 48h" — BR-008; `410 APPROVAL_EXPIRED` if acted too late).
- **TokenSetting** per child: a toggle "Allow tokens without my approval" (default off).
- List view filterable by status/child; empty state "No approvals waiting."

### [TASK-001] ChildMode — constrained UI (FR-025/026)
When a **child** is logged in: **no Zone-1**, **no subject switcher** (subject fixed to self), only
their **trainer lane-tabs** + Zone-3. Slightly larger touch targets, friendlier copy.
- Locked actions (add trainer, buy tokens, change associations, see parent data) are **not hidden but
  shown disabled** with a gentle **"Ask a grown-up"** affordance; attempting a purchase opens a
  request that routes to the parent (creates a `PENDING` approval) rather than a hard block.
- A new-trainer ShareLink → blocked screen: "Ask a parent to add Coach {X}" + "We let your parent know."

---

## [TASK-001] Availability — Best Times / My Times (2026-05-29) — *signature data component*

> **⚠ Carries the API flag:** spec assumes **shared-per-child Best Times** (one schedule, no per-trainer
> split). If client chooses per-coach, this grid moves into Zone-3 and renders per trainer-tab. Built to
> swap with minimal change.

### [TASK-001] WeeklyAvailabilityGrid
- **The "training board":** 7 day-columns × time-rows, chalk-line grid on `--surface-sunken`. Painting
  a range fills cells with `--go-tint` + a `--go` left lane-edge; times in `mono` tabular.
- **Interaction:** click-drag to paint a slot, click a slot to edit/remove (start/end time popover).
  `PUT` sends the full slot set (replace semantics). Server-rejected overlaps → the offending slots flash
  `--foul` with a message.
- **Coach My-Times (FR-030):** recurring weekly, multiple slots/day, same grid.
- **Player/Parent Best-Times (FR-039):** same grid, set per subject (via the Family roster, since it's
  Zone-2/per-subject).
- **A11y (critical):** grid is keyboard-operable — arrow keys move a cell cursor, **Space** toggles,
  Shift+Arrow extends a range; a **list-mode fallback** ("Add slot" → day + start + end selects) is the
  primary path for screen readers. Each slot announced.
- **States:** empty ("No times set") · editing · saving · conflict.
- **Responsive:** <760px → **day accordion** (one day at a time, vertical slot list) instead of the grid.

### [TASK-001] TrainerAvailabilityView (FR-034)
- Trainer-side, Zone-3/org. Read-only **heatmap** across players: rows = players, columns = day/time
  buckets, cell intensity = how many players are available. **Filter** by day + "available at/after"
  time → list narrows; player cards show a "Best Times" summary chip. Advisory framing (BR-012).

### [TASK-001] ConflictOverrideModal (FR-031)
- When assigning a coach against their My-Times: a **warning modal** (`--pending`) stating the conflict;
  override requires a **typed reason** (logged). Confirm = override + audit; cancel keeps the conflict.

---

## [TASK-001] Portal Branding Settings (2026-05-29) — the meta screen (FR-037)

Where a trainer sets the theme that re-skins their players' portal. **Themed with their own brand,
live.** This screen *is* the design system's variable in action.

### [TASK-001] BrandingSettings
- **LogoUploader:** PNG/JPG/**SVG** ≤2MB, ~200×200 auto-resize; drag/drop; shows current + new preview;
  errors inline (`413`/`415`).
- **Color picker:** hex input (validates `^#[0-9A-Fa-f]{6}$`) + swatch grid + eyedropper; on change,
  **the whole preview pane re-themes instantly** (sets `--brand` + recomputes `--brand-text`/`-ink`),
  and a **contrast read-out** warns if the chosen color would force heavy darkening for text ("we'll use
  a darker shade for text to stay readable").
- **Live preview pane:** a miniature of the player portal (Channel Bar + a card + a button + a badge)
  rendered with the pending brand — *"this is what your players will see."*
- **Reset to default** (Cinder) + **Apply org-wide** (save). States: clean/dirty/saving/saved/error.
- **A11y:** the preview never sacrifices AA — the derivation guarantees it; the read-out makes the
  trade-off explicit to the trainer.

---

## [TASK-001] Shared Components & Patterns (2026-05-29)

| Component | Spec |
|-----------|------|
| **StatusBadge** | pill, `label` type; semantic color + `-tint` bg; `DELETED` adds strikethrough. |
| **CountdownRing** | SVG ring + `mono` center; `pending`→`foul` thresholds; text equivalent for SR; pauses on reduced-motion (shows static remaining). |
| **DestructiveConfirm** | `--foul` modal; consequence bullets; optional reason; **type-to-confirm** for irreversible (GDPR delete). |
| **Toast** | top-right slide-in (`--dur-2`); variants info/go/pending/foul; channel-label support; auto-dismiss + manual; `role=status`/`alert`. |
| **DataTable** | hairline rows, tabular figures, sticky header, row-busy state, keyset "Load more", → card-stack under 960px. |
| **EmptyState** | faint lane-chalk motif, one-line `display-l`, a single primary action. |
| **Skeleton** | chalk-sheen shimmer; matches final layout to avoid shift. |
| **FormField** | `label` (uppercase) + input + helper/error; focus = `--brand-line` underline-grow; error = `--foul` border + `aria-describedby` message; inputs `--r-sm`, 1px `--line-strong`. |
| **Modal/Sheet** | `--shadow-pop`, focus-trap + restore, ESC + scrim close; → bottom-sheet on mobile. |
| **ContextBouncer** | global handler for `410 CONTEXT_INACTIVE`/`403 CONTEXT_FORBIDDEN` → toast + auto-tune to default (no broken screen). |

**Global error→UX mapping** (by `errorCode`, from the API catalog): `VALIDATION_ERROR` → field-level
(`details[]`); `403 CSRF_INVALID`/`UNAUTHENTICATED` → silent token refresh, else re-login; `RATE_LIMITED`
→ disable + `Retry-After` countdown; `FORCE_PASSWORD_CHANGE` → route to forced-change; tenant/minor
forbiddens → friendly "not available here" (never raw 403 text).

---

## [TASK-001] Responsive System (2026-05-29)

Mobile-first (NFR-010). Breakpoints: `sm 0–599 · md 600–899 · lg 900–1279 · xl 1280+`.

| Pattern | lg/xl | md | sm |
|---------|-------|----|----|
| App shell | 240px rail + main | icon-rail (64px), toggle | top bar + hamburger drawer |
| Channel Bar | inline subject + tabs | dropdown + scrollable tabs | "Channel ▾" full-screen sheet |
| Data tables | full table | condensed / fewer cols | stacked cards |
| Availability grid | 7-day grid | 7-day grid (scroll-x) | day accordion |
| Modals | centered, `--shadow-pop` | centered | bottom sheet |
| Forms | 2-col where sensible | 1–2 col | single col, 44px targets |

---

## [TASK-001] Frontend State & API Integration Notes (2026-05-29)

Light guidance for `/coder-frontend` (detailed state ownership decided at implementation):

- **State lib:** Redux Toolkit (RTK) is in the repo. RTK Query for server cache keyed by resource;
  auth/session + active-context as slices.
- **ThemeProvider:** sets `--brand*` CSS vars from the active trainer's branding for branded zones;
  default Cinder elsewhere; recompute contrast-safe variants on change. Single source for the
  zone↔theme rule.
- **Active context:** an interceptor injects `X-Active-Context: <subjectProfileId>:<trainerId>` on
  Zone-3/subject-scoped requests; the ContextBouncer handles `410/403` globally. Context persisted to
  localStorage (+ `PUT /me/contexts/default`).
- **Auth transport:** cookies are httpOnly — the client never reads tokens; rely on `GET /auth/me` for
  the principal; a 401 triggers one `POST /auth/refresh` then retry.
- **CSRF:** read the `csrf` cookie, echo it as `X-CSRF-Token` on mutations.

---

## [TASK-001] Open Design Flags (2026-05-29)

| Flag | Impact |
|------|--------|
| **Aesthetic direction** | "Cinder & Chalk" is a committed, context-driven choice. If you want a different vibe (e.g. soft/organic, or minimal-enterprise), this whole spec re-skins — say so before implementation. |
| **Best Times scoping** (API flag) | Grid built shared-per-child (Zone-2). Per-coach would move it to Zone-3 + per-tab. |
| **Child login UX** (minor-login model) | ChildMode assumes children can log in; if product disallows child login, drop ChildMode + the "Ask a grown-up" flows. |
| **Default platform brand color (Cinder #E14817)** | Used in all unbranded/Super-Admin/auth surfaces and as the branding fallback. Swap if there's an official platform brand color. |
| **Dark mode default per role** | Shipped for both; default-on vs system-respecting per role is a product call. |

---

*Components added by later epics append below with their own `### [TASK-N] Component` headers,
inheriting this Design System.*
