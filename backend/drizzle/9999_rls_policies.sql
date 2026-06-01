-- Row-Level Security backstop for tenant-owned tables (NFR-011).
-- Applied AFTER drizzle-kit migrations via `npm run db:rls` (it is NOT in the drizzle journal).
--
-- Two per-transaction GUCs drive the policies (set by ScopedRepository / JwtAuthGuard):
--   app.current_trainer_id  — the active tenant (Zone-3, trainer-scoped access)
--   app.current_user_id     — the authenticated principal (architect review R2: enables the
--                             parent/account zone + TenantGuard's pre-resolution read under FORCE RLS)
-- Unset GUCs read as NULL → predicates fail closed (no rows).
--
-- `availability` is intentionally excluded (P-4: shared-per-subject, no trainerId).
-- Public reads with no session (join resolve, public branding) use the BYPASSRLS system pool.

-- ── helpers (inline) ────────────────────────────────────────────────────────
--   trainer GUC : NULLIF(current_setting('app.current_trainer_id', true), '')::uuid
--   user GUC    : NULLIF(current_setting('app.current_user_id',   true), '')::uuid

-- ── trainer_player_associations ─────────────────────────────────────────────
ALTER TABLE trainer_player_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_player_associations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpa_isolation ON trainer_player_associations;
CREATE POLICY tpa_isolation ON trainer_player_associations
  FOR ALL
  USING (
    trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM player_profiles p
      WHERE p.id = trainer_player_associations.player_profile_id
        AND NULLIF(current_setting('app.current_user_id', true), '')::uuid
            IN (p.user_id, p.parent_user_id)
    )
  )
  WITH CHECK (trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid);

-- ── trainer_coach_associations ──────────────────────────────────────────────
ALTER TABLE trainer_coach_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_coach_associations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tca_isolation ON trainer_coach_associations;
CREATE POLICY tca_isolation ON trainer_coach_associations
  FOR ALL
  USING (
    trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM coach_profiles c
      WHERE c.id = trainer_coach_associations.coach_profile_id
        AND c.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  WITH CHECK (trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid);

-- ── share_links (trainer-scoped; public resolve uses system pool) ────────────
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sl_isolation ON share_links;
CREATE POLICY sl_isolation ON share_links
  FOR ALL
  USING (trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid)
  WITH CHECK (trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid);

-- ── child_purchase_approvals (parent reads/updates across trainers — R2) ─────
-- NOTE: the child-INSERT path is finalized in Phase 8 alongside the minor-login
-- decision (architect review R3); the dual-axis predicate below already covers
-- parent read + approve/deny without an active trainer context (Zone-1).
ALTER TABLE child_purchase_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_purchase_approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cpa_isolation ON child_purchase_approvals;
CREATE POLICY cpa_isolation ON child_purchase_approvals
  FOR ALL
  USING (
    trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid
    OR parent_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK (
    trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid
    OR parent_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

-- ── availability_overrides (trainer-scoped) ─────────────────────────────────
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ao_isolation ON availability_overrides;
CREATE POLICY ao_isolation ON availability_overrides
  FOR ALL
  USING (trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid)
  WITH CHECK (trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid);

-- ── trainer_branding (own-org writes; public read uses system pool) ──────────
ALTER TABLE trainer_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_branding FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tb_isolation ON trainer_branding;
CREATE POLICY tb_isolation ON trainer_branding
  FOR ALL
  USING (trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid)
  WITH CHECK (trainer_id = NULLIF(current_setting('app.current_trainer_id', true), '')::uuid);
