import { plainToInstance } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

class EnvVars {
  @IsString() DATABASE_URL: string;
  @IsString() @MinLength(32) JWT_ACCESS_SECRET: string;
  @IsString() @MinLength(32) JWT_REFRESH_SECRET: string;
  @IsString() REDIS_URL: string;
  @IsString() @MinLength(32) CSRF_SECRET: string;
  @IsString() APP_BASE_URL: string; // explicit CORS allow-list (pairs with M5)

  @IsOptional() @IsString() SYSTEM_DATABASE_URL?: string;
  @IsOptional() @IsString() MIGRATION_DATABASE_URL?: string;

  // Runtime-consumed vars (safe defaults applied below where omission would be insecure).
  @IsOptional() @IsBooleanString() COOKIE_SECURE?: string;
  @IsOptional() @IsInt() ACCESS_TOKEN_TTL?: number;
  @IsOptional() @IsInt() REFRESH_TOKEN_TTL?: number;
  @IsOptional() @IsInt() IMPERSONATION_TTL?: number;
  @IsOptional() @IsIn(['local', 's3']) STORAGE_DRIVER?: string;
  @IsOptional() @IsIn(['console', 'smtp']) MAILER_DRIVER?: string;
}

/** Fail-fast env validation wired into ConfigModule.forRoot({ validate }). NFR-006/§13. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });
  if (errors.length) {
    const detail = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`)
      .join(' | ');
    throw new Error(`Invalid/missing environment variables: ${detail}`);
  }
  if (validated.JWT_ACCESS_SECRET === validated.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct.');
  }
  // COOKIE_SECURE defaults to 'true' so production never silently issues non-secure cookies;
  // dev/test .env can opt out with COOKIE_SECURE=false.
  return { COOKIE_SECURE: 'true', ...config };
}
