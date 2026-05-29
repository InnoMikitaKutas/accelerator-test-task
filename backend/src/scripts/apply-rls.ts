/**
 * Applies drizzle/9999_rls_policies.sql using the migration/owner role.
 * Run after `npm run db:migrate`:  `npm run db:rls`
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL must be set');

  const sql = readFileSync(join(__dirname, '../../drizzle/9999_rls_policies.sql'), 'utf8');
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(sql);
    // eslint-disable-next-line no-console
    console.log('RLS policies applied.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
