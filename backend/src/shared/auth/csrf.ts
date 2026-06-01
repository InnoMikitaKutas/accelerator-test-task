import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { doubleCsrf } from 'csrf-csrf';

/**
 * Double-submit CSRF (FR-009) via csrf-csrf. A stable per-browser `csrf.sid` cookie binds the
 * token (decoupled from auth-token rotation). The SPA fetches a token from `GET /auth/csrf`
 * and echoes it in the `X-CSRF-Token` header on every mutating request.
 *
 * R6: because `csrf.sid` is bootstrapped on the first request, even pre-auth POSTs (login,
 * /join registration) have a CSRF session — no special-casing needed.
 */
export function buildCsrf(secret: string, secure: boolean) {
  const SID = 'csrf.sid';

  const utils = doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: (req: Request) => (req.cookies?.[SID] as string) ?? '',
    cookieName: 'csrf',
    cookieOptions: { sameSite: 'strict', path: '/', secure, httpOnly: true },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getTokenFromRequest: (req: Request) => req.headers['x-csrf-token'],
    errorConfig: {
      statusCode: 403,
      code: 'CSRF_INVALID',
      message: 'Invalid or missing CSRF token.',
    },
  });

  /** Ensures a stable csrf session id cookie exists before token generation/validation. */
  const csrfSessionMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!req.cookies?.[SID]) {
      const sid = randomUUID();
      res.cookie(SID, sid, { httpOnly: true, sameSite: 'strict', secure, path: '/' });
      req.cookies = { ...(req.cookies ?? {}), [SID]: sid };
    }
    next();
  };

  /** Express error handler mapping csrf failures to the standard envelope (403 CSRF_INVALID). */
  const csrfErrorHandler = (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === 'CSRF_INVALID' || err === utils.invalidCsrfTokenError) {
      return res.status(403).json({
        statusCode: 403,
        error: 'Forbidden',
        errorCode: 'CSRF_INVALID',
        message: 'Invalid or missing CSRF token.',
      });
    }
    return next(err);
  };

  return {
    csrfSessionMiddleware,
    doubleCsrfProtection: utils.doubleCsrfProtection,
    generateToken: utils.generateToken,
    csrfErrorHandler,
  };
}
