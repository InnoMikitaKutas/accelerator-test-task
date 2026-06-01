import { defineConfig } from 'drizzle-kit';

// Migrations run as the OWNER role so the runtime `app`/`system` roles stay non-owners
// (required for FORCE ROW LEVEL SECURITY to apply). Falls back to DATABASE_URL for
// single-role dev setups.
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL must be set');

export default defineConfig({
  schema: './src/shared/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url },
});
