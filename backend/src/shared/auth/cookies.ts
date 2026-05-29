import { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';

// Refresh cookie is scoped to the auth path so it's only sent to /auth/refresh & /auth/logout.
const REFRESH_PATH = '/api/v1/auth';

export function baseCookieOpts(config: ConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get('COOKIE_SECURE') === 'true',
    sameSite: 'strict',
    domain: config.get<string>('COOKIE_DOMAIN'),
    path: '/',
  };
}

/** Sets the access (`at`) + refresh (`rt`) httpOnly cookies (api-spec auth transport). */
export function setAuthCookies(res: Response, config: ConfigService, at: string, rt: string): void {
  const base = baseCookieOpts(config);
  res.cookie('at', at, { ...base, maxAge: Number(config.get('ACCESS_TOKEN_TTL', 900)) * 1000 });
  res.cookie('rt', rt, {
    ...base,
    path: REFRESH_PATH,
    maxAge: Number(config.get('REFRESH_TOKEN_TTL', 604800)) * 1000,
  });
}

/** Sets only the access cookie (impersonation — short-lived, no refresh rotation). */
export function setAccessCookie(res: Response, config: ConfigService, at: string, maxAgeSec: number): void {
  res.cookie('at', at, { ...baseCookieOpts(config), maxAge: maxAgeSec * 1000 });
}

export function clearAuthCookies(res: Response, config: ConfigService): void {
  const base = baseCookieOpts(config);
  res.clearCookie('at', base);
  res.clearCookie('rt', { ...base, path: REFRESH_PATH });
}
