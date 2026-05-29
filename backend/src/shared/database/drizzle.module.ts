import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { DRIZZLE, PG_POOL, SYSTEM_DRIZZLE, SYSTEM_PG_POOL } from './drizzle.constants';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL'), max: 20 }),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema, casing: 'snake_case' }),
    },
    // System pool (BYPASSRLS). Falls back to DATABASE_URL only if SYSTEM_DATABASE_URL is unset
    // (single-role dev); production MUST set a distinct BYPASSRLS role.
    {
      provide: SYSTEM_PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString:
            config.get<string>('SYSTEM_DATABASE_URL') ?? config.getOrThrow<string>('DATABASE_URL'),
          max: 5,
        }),
    },
    {
      provide: SYSTEM_DRIZZLE,
      inject: [SYSTEM_PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema, casing: 'snake_case' }),
    },
  ],
  exports: [DRIZZLE, PG_POOL, SYSTEM_DRIZZLE, SYSTEM_PG_POOL],
})
export class DrizzleModule {}
