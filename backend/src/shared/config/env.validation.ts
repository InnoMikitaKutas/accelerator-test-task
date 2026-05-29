import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, validateSync } from 'class-validator';

class EnvVars {
  @IsString() DATABASE_URL: string;
  @IsString() JWT_ACCESS_SECRET: string;
  @IsString() JWT_REFRESH_SECRET: string;
  @IsString() REDIS_URL: string;
  @IsString() CSRF_SECRET: string;
  @IsOptional() @IsString() SYSTEM_DATABASE_URL?: string;
  @IsOptional() @IsString() MIGRATION_DATABASE_URL?: string;
}

/** Fail-fast env validation wired into ConfigModule.forRoot({ validate }). */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });
  if (errors.length) {
    const missing = errors.map((e) => e.property).join(', ');
    throw new Error(`Invalid/missing environment variables: ${missing}`);
  }
  return config;
}
