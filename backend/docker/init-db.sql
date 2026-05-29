-- Dev role setup for Row-Level Security (architect review R1).
-- Tables are owned by `postgres` (migration role). The two app-tier roles below are
-- NON-superusers so FORCE ROW LEVEL SECURITY actually applies to them.
--   app    : the runtime pool (DATABASE_URL). Subject to RLS — sees only its tenant.
--   system : background jobs / Super Admin cross-tenant reads (SYSTEM_DATABASE_URL). BYPASSRLS.
-- Superusers always bypass RLS, so neither of these may be a superuser.

CREATE ROLE app WITH LOGIN PASSWORD 'app' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE "system" WITH LOGIN PASSWORD 'system' NOSUPERUSER BYPASSRLS;

GRANT CONNECT ON DATABASE training TO app, "system";
GRANT USAGE, CREATE ON SCHEMA public TO app, "system";

-- Objects are created later by `postgres` (drizzle migrations run as MIGRATION_DATABASE_URL).
-- Default privileges grant the app/system roles access to those future tables + sequences.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app, "system";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app, "system";

-- Allow the app role to set the per-transaction tenant GUC used by RLS policies.
-- (custom GUCs in the `app.` namespace are settable by any role via SET LOCAL; no grant needed,
--  documented here for clarity.)
