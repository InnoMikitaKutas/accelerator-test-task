import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgres://x',
  REDIS_URL: 'redis://x',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  CSRF_SECRET: 'c'.repeat(32),
  APP_BASE_URL: 'http://localhost:5173',
};

describe('validateEnv', () => {
  it('rejects a short secret', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow();
  });

  it('rejects access === refresh secret', () => {
    expect(() => validateEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(/distinct/i);
  });

  it('rejects missing APP_BASE_URL', () => {
    const noBase: Record<string, unknown> = { ...base };
    delete noBase.APP_BASE_URL;
    expect(() => validateEnv(noBase)).toThrow();
  });

  it('rejects a non-boolean COOKIE_SECURE', () => {
    expect(() => validateEnv({ ...base, COOKIE_SECURE: 'yes' })).toThrow();
  });

  it('rejects an unknown STORAGE_DRIVER', () => {
    expect(() => validateEnv({ ...base, STORAGE_DRIVER: 'ftp' })).toThrow();
  });

  it('accepts a valid config and applies the COOKIE_SECURE default', () => {
    const out = validateEnv(base);
    expect(out.COOKIE_SECURE).toBe('true');
  });

  it('keeps an explicit COOKIE_SECURE=false (dev opt-out)', () => {
    const out = validateEnv({ ...base, COOKIE_SECURE: 'false' });
    expect(out.COOKIE_SECURE).toBe('false');
  });
});
