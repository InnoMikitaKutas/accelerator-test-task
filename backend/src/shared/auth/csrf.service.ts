import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { buildCsrf } from './csrf';

/** Injectable wrapper around the double-submit CSRF utilities (FR-009). */
@Injectable()
export class CsrfService {
  private readonly csrf: ReturnType<typeof buildCsrf>;

  constructor(config: ConfigService) {
    this.csrf = buildCsrf(
      config.getOrThrow<string>('CSRF_SECRET'),
      config.get('COOKIE_SECURE') === 'true',
    );
  }

  get sessionMiddleware() {
    return this.csrf.csrfSessionMiddleware;
  }
  get protection() {
    return this.csrf.doubleCsrfProtection;
  }
  get errorHandler() {
    return this.csrf.csrfErrorHandler;
  }

  /** Mint a CSRF token for the client (exposed via GET /auth/csrf). */
  issueToken(req: Request, res: Response): string {
    return this.csrf.generateToken(req, res);
  }
}

@Global()
@Module({ providers: [CsrfService], exports: [CsrfService] })
export class CsrfModule {}
