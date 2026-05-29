/* eslint-disable */
// Dev/test placeholders (NOT real secrets). Real values come from the environment in CI/prod.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://app:app@localhost:5432/training';
process.env.SYSTEM_DATABASE_URL ??= 'postgres://system:system@localhost:5432/training';
process.env.MIGRATION_DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/training';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.CSRF_SECRET ??= 'test-csrf-secret';
process.env.COOKIE_SECURE = 'false';
process.env.APP_BASE_URL ??= 'http://localhost:5173';
process.env.OUTBOX_RELAY_ENABLED = 'false';
process.env.ACCESS_TOKEN_TTL ??= '900';
process.env.REFRESH_TOKEN_TTL ??= '604800';
process.env.VERIFICATION_TOKEN_TTL ??= '86400';
