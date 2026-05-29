import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import type { Request } from 'express';
import { validateEnv } from '@shared/config/env.validation';
import { DrizzleModule } from '@shared/database/drizzle.module';
import { RedisModule } from '@shared/redis/redis.module';
import { AuthSharedModule } from '@shared/auth/auth-shared.module';
import { CsrfModule } from '@shared/auth/csrf.service';
import { TenancyModule } from '@shared/tenancy/tenancy.module';
import { MailerModule } from '@shared/mailer/mailer.module';
import { StorageModule } from '@shared/storage/storage.module';
import { MessagingModule } from '@shared/messaging/messaging.module';
import { AuditModule } from '@shared/audit/audit.module';
import { CTX_KEYS } from '@shared/context/request-context';
import { JwtAuthGuard } from '@shared/auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '@shared/auth/guards/email-verified.guard';
import { ForcePasswordChangeGuard } from '@shared/auth/guards/force-password-change.guard';
import { RolesGuard } from '@shared/auth/guards/roles.guard';
import { TenantGuard } from '@shared/tenancy/tenant.guard';
import { MinorAccountGuard } from '@shared/auth/guards/minor-account.guard';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { ProfilesModule } from '@modules/profiles/profiles.module';
import { ContextModule } from '@modules/context/context.module';
import { SharelinksModule } from '@modules/sharelinks/sharelinks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req: Request) => cls.set(CTX_KEYS.ip, req.ip),
      },
    }),
    // FR-007: in-memory throttler (single-node MVP). Swap to a Redis store for multi-node.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DrizzleModule,
    RedisModule,
    AuthSharedModule,
    CsrfModule,
    TenancyModule,
    MailerModule,
    StorageModule,
    MessagingModule,
    AuditModule,
    // Feature modules
    AuthModule,
    UsersModule,
    ProfilesModule,
    ContextModule,
    SharelinksModule,
  ],
  providers: [
    // Rate limiting runs first (FR-007).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global guard chain — ORDER MATTERS (api-spec §Guard chain + architect review).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EmailVerifiedGuard },
    { provide: APP_GUARD, useClass: ForcePasswordChangeGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: MinorAccountGuard },
  ],
})
export class AppModule {}
