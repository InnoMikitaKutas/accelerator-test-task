/** Runtime app pool — subject to Row-Level Security (sees only the active tenant). */
export const DRIZZLE = Symbol('DRIZZLE');
export const PG_POOL = Symbol('PG_POOL');

/**
 * System pool — connects as a BYPASSRLS role (architect review R1).
 * ONLY for background jobs (outbox relay, timed expiries) and Super Admin
 * cross-tenant reads. Never inject this into request-scoped tenant code paths.
 */
export const SYSTEM_DRIZZLE = Symbol('SYSTEM_DRIZZLE');
export const SYSTEM_PG_POOL = Symbol('SYSTEM_PG_POOL');
