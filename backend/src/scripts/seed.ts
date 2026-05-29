/**
 * Idempotent dev seed: one SUPER_ADMIN + a demo TRAINER (with a static ShareLink).
 * Run after migrate + rls:  `npm run db:seed`
 */
import 'reflect-metadata';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { shareLinks, trainerProfiles, users } from '../shared/database/schema';
import { generateShareCode } from '../modules/sharelinks/sharelink.util';

async function main() {
  const url = process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('SYSTEM_DATABASE_URL or DATABASE_URL must be set');
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { casing: 'snake_case' });
  const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

  try {
    const saEmail = (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@training.local').toLowerCase();
    const [existingSa] = await db.select().from(users).where(eq(users.email, saEmail)).limit(1);
    if (!existingSa) {
      await db.insert(users).values({
        email: saEmail,
        passwordHash: await hash(process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'Admin1234'),
        role: 'SUPER_ADMIN',
        emailVerified: true,
        firstName: 'Super',
        lastName: 'Admin',
      });
      // eslint-disable-next-line no-console
      console.log(`super admin created: ${saEmail}`);
    }

    const tEmail = 'trainer@training.local';
    const [existingT] = await db.select().from(users).where(eq(users.email, tEmail)).limit(1);
    if (!existingT) {
      const [t] = await db
        .insert(users)
        .values({
          email: tEmail,
          passwordHash: await hash('Trainer1234'),
          role: 'TRAINER',
          emailVerified: true,
          firstName: 'Demo',
          lastName: 'Trainer',
        })
        .returning();
      const [tp] = await db
        .insert(trainerProfiles)
        .values({ userId: t.id, businessName: 'Demo Club' })
        .returning();
      const code = generateShareCode();
      await db
        .insert(shareLinks)
        .values({ code, type: 'static', trainerId: tp.id, createdBy: t.id, status: 'ACTIVE', active: true });
      // eslint-disable-next-line no-console
      console.log(`demo trainer created: ${tEmail} | static join code: ${code}`);
    }
    // eslint-disable-next-line no-console
    console.log('seed complete');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
