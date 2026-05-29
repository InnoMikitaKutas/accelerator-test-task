import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors({ origin: process.env.APP_BASE_URL?.split(',') ?? true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // Phase 2.2 swaps in the validationExceptionFactory + AllExceptionsFilter for the
  // stable error-code envelope.

  const config = new DocumentBuilder()
    .setTitle('Training Platform API')
    .setDescription('Epic-01 — User Management & Authentication')
    .setVersion('1')
    .addCookieAuth('at')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Active-Context' }, 'active-context')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
