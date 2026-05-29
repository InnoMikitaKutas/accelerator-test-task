import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestApp } from './app.factory';

/**
 * E2E: ShareLink registration → (blocked unverified login) → verify → login.
 * Exercises the real cookie + CSRF + guard pipeline against the live DB/Redis.
 */
describe('Auth & registration (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let system: Pool;
  let code: string;

  beforeAll(async () => {
    system = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL });
    const u = await system.query(
      `INSERT INTO users (email, password_hash, role, email_verified, first_name, last_name)
       VALUES ($1, 'x', 'TRAINER', true, 'E2E', 'Trainer') RETURNING id`,
      [`e2e-trainer-${Date.now()}@t.local`],
    );
    const tp = await system.query(
      `INSERT INTO trainer_profiles (user_id, business_name) VALUES ($1, 'E2E Club') RETURNING id`,
      [u.rows[0].id],
    );
    code = `e2e-${Date.now().toString(36)}`;
    await system.query(
      `INSERT INTO share_links (code, type, trainer_id, created_by, status, active)
       VALUES ($1, 'static', $2, $3, 'ACTIVE', true)`,
      [code, tp.rows[0].id, u.rows[0].id],
    );
    app = await createTestApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    await system.end();
  });

  const getCsrf = async (agent: ReturnType<typeof request.agent>): Promise<string> => {
    const r = await agent.get('/api/v1/auth/csrf').expect(200);
    return r.body.csrfToken as string;
  };

  async function verificationTokenFor(email: string): Promise<string> {
    const ob = await system.query(
      `SELECT payload FROM outbox_messages
       WHERE type = 'email.verification' AND payload->>'to' = $1
       ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    const link = ob.rows[0].payload.vars.link as string;
    return new URL(link).searchParams.get('token') as string;
  }

  it('resolves a valid static link', async () => {
    const r = await request(server).get(`/api/v1/join/${code}`).expect(200);
    expect(r.body.status).toBe('VALID');
    expect(r.body.type).toBe('static');
  });

  it('rejects a mutating request without a CSRF token', async () => {
    const r = await request(server)
      .post(`/api/v1/join/${code}`)
      .send({ email: 'z@z.com', password: 'Passw0rd', firstName: 'Z', lastName: 'Z' })
      .expect(403);
    expect(r.body.errorCode).toBe('CSRF_INVALID');
  });

  it('register → auto-login (unverified) → verify → login', async () => {
    const email = `player-${Date.now()}@p.local`;
    const agent = request.agent(server);
    const csrf = await getCsrf(agent);

    const reg = await agent
      .post(`/api/v1/join/${code}`)
      .set('x-csrf-token', csrf)
      .send({ email, password: 'Passw0rd', firstName: 'Pat', lastName: 'Player' })
      .expect(201);
    expect(reg.body.role).toBe('PLAYER');
    expect(reg.body.emailVerified).toBe(false);

    // logged in but unverified — /me is allowed (@AllowUnverified)
    await agent
      .get('/api/v1/auth/me')
      .expect(200)
      .expect((r) => expect(r.body.emailVerified).toBe(false));

    // login before verifying → EMAIL_NOT_VERIFIED
    const loginAgent = request.agent(server);
    const t1 = await getCsrf(loginAgent);
    await loginAgent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', t1)
      .send({ email, password: 'Passw0rd' })
      .expect(403)
      .expect((r) => expect(r.body.errorCode).toBe('EMAIL_NOT_VERIFIED'));

    // verify using the token captured from the outbox
    const vtoken = await verificationTokenFor(email);
    await agent.post('/api/v1/auth/verify-email').set('x-csrf-token', csrf).send({ token: vtoken }).expect(200);

    // now login succeeds
    const loginAgent2 = request.agent(server);
    const t2 = await getCsrf(loginAgent2);
    await loginAgent2
      .post('/api/v1/auth/login')
      .set('x-csrf-token', t2)
      .send({ email, password: 'Passw0rd' })
      .expect(200)
      .expect((r) => expect(r.body.emailVerified).toBe(true));
  });

  it('login with wrong password → INVALID_CREDENTIALS', async () => {
    const agent = request.agent(server);
    const csrf = await getCsrf(agent);
    await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: 'nobody@nowhere.local', password: 'whatever1' })
      .expect(401)
      .expect((r) => expect(r.body.errorCode).toBe('INVALID_CREDENTIALS'));
  });
});
