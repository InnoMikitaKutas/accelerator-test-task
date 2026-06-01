import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Training Platform API')
    .setDescription('Epic-01 — User Management & Authentication')
    .setVersion('1')
    .addCookieAuth('at')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Active-Context' }, 'active-context')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const config = app.get(ConfigService);
  await app.listen(config.get<number>('PORT') ?? 3000);
}

void bootstrap();
