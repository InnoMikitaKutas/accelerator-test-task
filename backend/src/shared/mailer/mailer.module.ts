import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { ConsoleMailerAdapter } from './console-mailer.adapter';

/**
 * Binds MailerService to an adapter by MAILER_DRIVER. Only `console` is implemented in Epic-01;
 * SES/SMTP adapters slot in here without touching callers.
 */
@Global()
@Module({
  providers: [{ provide: MailerService, useClass: ConsoleMailerAdapter }],
  exports: [MailerService],
})
export class MailerModule {}
