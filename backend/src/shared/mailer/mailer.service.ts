import type { MailTemplateId } from './templates';

export interface MailMessage {
  to: string;
  templateId: MailTemplateId;
  vars: Record<string, string>;
}

/** Provider-agnostic mail interface (architecture §Email). Used as an injection token. */
export abstract class MailerService {
  abstract send(msg: MailMessage): Promise<void>;
}
