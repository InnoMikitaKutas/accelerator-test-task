import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from '@shared/common/errors/all-exceptions.filter';
import { validationExceptionFactory } from '@shared/common/errors/validation-exception.factory';
import { CsrfService } from '@shared/auth/csrf.service';

/**
 * Applies all global middleware/pipes/filters. Shared by main.ts and the e2e test factory so
 * tests exercise the real security pipeline (helmet, cookies, CSRF, versioning, error envelope).
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  const csrf = app.get(CsrfService);
  app.use(csrf.sessionMiddleware);
  app.use(csrf.protection);
  app.use(csrf.errorHandler);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors({
    origin: config.get<string>('APP_BASE_URL')?.split(',') ?? true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
