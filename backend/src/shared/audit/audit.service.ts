import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { auditLogs } from '@shared/database/schema';
import { CTX_KEYS, SessionPrincipal } from '@shared/context/request-context';

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Writes audit rows attributed via CLS (actor + impersonator + ip) — NFR-008 / FR-016. */
@Injectable()
export class AuditService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cls: ClsService,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLogs).values({
      actorUserId: this.cls.get<SessionPrincipal>(CTX_KEYS.user)?.id ?? null,
      impersonatorAdminId: this.cls.get<string>(CTX_KEYS.impersonatorAdminId) ?? null,
      ip: this.cls.get<string>(CTX_KEYS.ip) ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
    });
  }
}
