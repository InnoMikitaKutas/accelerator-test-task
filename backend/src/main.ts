import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from '@shared/common/errors/all-exceptions.filter';
import { validationExceptionFactory } from '@shared/common/errors/validation-exception.factory';
import { CsrfService } from '@shared/auth/csrf.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  // CSRF (FR-009): bootstrap a session id, protect mutating requests, map failures to the envelope.
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Training Platform API')
    .setDescription('Epic-01 — User Management & Authentication')
    .setVersion('1')
    .addCookieAuth('at')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Active-Context' }, 'active-context')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.get<number>('PORT') ?? 3000);
}

void bootstrap();
