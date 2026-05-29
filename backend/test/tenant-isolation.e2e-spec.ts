import { Pool } from 'pg';

/**
 * NFR-011 — proves Row-Level Security isolation against the live DB using the RLS-subject `app`
 * role. Seeds two trainers via the BYPASSRLS `system` role, then asserts the `app` role cannot
 * cross tenants. Requires `db:migrate` + `db:rls` to have been applied.
 */
describe('RLS tenant isolation (NFR-011)', () => {
  let app: Pool;
  let system: Pool;
  let trainerA: string;
  let trainerB: string;
  let userA: string;

  async function seedTrainer(label: string): Promise<{ trainerId: string; userId: string }> {
    const u = await system.query(
      `INSERT INTO users (email, password_hash, role, email_verified, first_name, last_name)
       VALUES ($1, 'x', 'TRAINER', true, 'Iso', $2) RETURNING id`,
      [`iso-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@t.local`, label],
    );
    const userId = u.rows[0].id as string;
    const tp = await system.query(
      `INSERT INTO trainer_profiles (user_id, business_name) VALUES ($1, $2) RETURNING id`,
      [userId, `Org ${label}`],
    );
    const trainerId = tp.rows[0].id as string;
    await system.query(
      `INSERT INTO share_links (code, type, trainer_id, created_by, status, active)
       VALUES ($1, 'static', $2, $3, 'ACTIVE', true)`,
      [`iso-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, trainerId, userId],
    );
    return { trainerId, userId };
  }

  beforeAll(async () => {
    app = new Pool({ connectionString: process.env.DATABASE_URL });
    system = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL });
    const a = await seedTrainer('A');
    const b = await seedTrainer('B');
    trainerA = a.trainerId;
    userA = a.userId;
    trainerB = b.trainerId;
  });

  afterAll(async () => {
    await app.end();
    await system.end();
  });

  it('fails closed: no tenant GUC → the app role sees zero share_links', async () => {
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      const r = await c.query('SELECT count(*)::int AS n FROM share_links');
      expect(r.rows[0].n).toBe(0);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
  });

  it("trainer A's context sees only A's links, never B's", async () => {
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.current_trainer_id', $1, true)`, [trainerA]);
      const r = await c.query('SELECT trainer_id FROM share_links');
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.every((x: { trainer_id: string }) => x.trainer_id === trainerA)).toBe(true);
      expect(r.rows.some((x: { trainer_id: string }) => x.trainer_id === trainerB)).toBe(false);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
  });

  it('WITH CHECK blocks inserting a link for another tenant', async () => {
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.current_trainer_id', $1, true)`, [trainerA]);
      await expect(
        c.query(
          `INSERT INTO share_links (code, type, trainer_id, created_by, status, active)
           VALUES ($1, 'static', $2, $3, 'ACTIVE', true)`,
          [`evil-${Date.now()}`, trainerB, userA],
        ),
      ).rejects.toBeDefined();
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
  });

  it('availability is NOT RLS-scoped (P-4 shared-per-subject)', async () => {
    const c = await app.connect();
    try {
      // No GUC set; availability has no policy → readable (returns a count without error).
      const r = await c.query('SELECT count(*)::int AS n FROM availability');
      expect(typeof r.rows[0].n).toBe('number');
    } finally {
      c.release();
    }
  });
});
