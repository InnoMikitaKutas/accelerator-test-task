import { Injectable, Logger } from '@nestjs/common';
import { MailerService, MailMessage } from './mailer.service';
import { TEMPLATES } from './templates';

/** Dev adapter — logs the rendered email instead of sending (MAILER_DRIVER=console). */
@Injectable()
export class ConsoleMailerAdapter extends MailerService {
  private readonly logger = new Logger('Mailer');

  async send(msg: MailMessage): Promise<void> {
    const tpl = TEMPLATES[msg.templateId];
    this.logger.log(
      `[email:${msg.templateId}] to=${msg.to} subject="${tpl.subject}" body="${tpl.render(msg.vars)}"`,
    );
  }
}
