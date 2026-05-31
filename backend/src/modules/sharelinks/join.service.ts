import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { SYSTEM_DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import {
  coachProfiles,
  playerProfiles,
  shareLinks,
  trainerBranding,
  trainerProfiles,
  users,
  verificationTokens,
} from '@shared/database/schema';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { PasswordService } from '@shared/auth/password.service';
import { TokenService } from '@shared/auth/token.service';
import { generateRawToken, hashToken } from '@shared/auth/token-hash';
import { OutboxService } from '@shared/messaging/outbox.service';
import { SessionPrincipal } from '@shared/context/request-context';
import { AuthService, IssuedTokens } from '@modules/auth/auth.service';
import { SessionUserDto } from '@modules/auth/dto/session-user.dto';
import { AssociationService, AssociationResult } from './association.service';
import { JoinAssociateDto, JoinRegisterDto, JoinResolveDto } from './dto/sharelink.dto';
import { computeJoinStatus } from './sharelink.util';

/**
 * Public ShareLink consumption (P-2 registration entry). Runs on the SYSTEM (BYPASSRLS) pool
 * because it operates without a tenant session and spans users/profiles/associations atomically.
 */
@Injectable()
export class JoinService {
  constructor(
    @Inject(SYSTEM_DRIZZLE) private readonly db: DrizzleDB,
    private readonly associations: AssociationService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly outbox: OutboxService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async resolve(code: string): Promise<JoinResolveDto> {
    const [link] = await this.db.select().from(shareLinks).where(eq(shareLinks.code, code)).limit(1);
    if (!link) {
      return {
        code,
        type: 'static',
        status: 'INVALID',
        trainerDisplayName: '',
        branding: null,
        requiresAccount: true,
        prefillEmail: null,
      };
    }
    const [tp] = await this.db
      .select({ name: trainerProfiles.businessName })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.id, link.trainerId))
      .limit(1);
    const [b] = await this.db
      .select()
      .from(trainerBranding)
      .where(eq(trainerBranding.trainerId, link.trainerId))
      .limit(1);
    return {
      code: link.code,
      type: link.type,
      status: computeJoinStatus(link, new Date()),
      trainerDisplayName: tp?.name ?? '',
      branding: b ? { logoUrl: b.logoUrl, primaryColorHex: b.primaryColorHex } : null,
      requiresAccount: true,
      prefillEmail: link.targetEmail,
    };
  }

  /** Branch 1 — new user: create User + role profile + association + usage, in 1 tx; log them in. */
  async registerNew(code: string, dto: JoinRegisterDto): Promise<{ user: SessionUserDto; tokens: IssuedTokens }> {
    const email = dto.email.toLowerCase();
    const passwordHash = await this.passwords.hash(dto.password);
    const verTtl = Number(this.config.get('VERIFICATION_TOKEN_TTL', 86400));
    const base = this.config.get('APP_BASE_URL', 'http://localhost:5173');

    const user = await this.db.transaction(async (tx) => {
      const link = await this.lockValidLink(tx, code);
      if (link.type === 'unique' && link.targetEmail && link.targetEmail !== email) {
        throw new AppException(AppErrorCode.VALIDATION_ERROR, {
          details: [{ field: 'email', message: 'Email must match the invited address' }],
        });
      }
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) throw new AppException(AppErrorCode.EMAIL_EXISTS);

      const role = link.type === 'static' ? 'PLAYER' : 'COACH';
      const [created] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          role,
          emailVerified: false,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
        })
        .returning();

      if (role === 'PLAYER') {
        const [pp] = await tx
          .insert(playerProfiles)
          .values({ userId: created.id, firstName: dto.firstName, lastName: dto.lastName, isSelf: true })
          .returning();
        await this.associations.associatePlayer(tx, {
          trainerId: link.trainerId,
          playerProfileId: pp.id,
          viaShareLinkId: link.id,
        });
      } else {
        const [cp] = await tx.insert(coachProfiles).values({ userId: created.id }).returning();
        await this.associations.associateCoach(tx, { trainerId: link.trainerId, coachProfileId: cp.id });
      }

      await tx
        .update(shareLinks)
        .set(
          link.type === 'unique'
            ? { useCount: link.useCount + 1, status: 'ACCEPTED', active: false, updatedAt: new Date() }
            : { useCount: link.useCount + 1, updatedAt: new Date() },
        )
        .where(eq(shareLinks.id, link.id));

      const raw = generateRawToken();
      await tx
        .insert(verificationTokens)
        .values({ userId: created.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + verTtl * 1000) });
      await this.outbox.enqueue(tx, 'email.verification', {
        to: email,
        templateId: 'email.verification',
        vars: { name: dto.firstName, link: `${base}/verify-email?token=${raw}` },
      });
      await this.outbox.enqueue(tx, 'email.registration.confirm', {
        to: email,
        templateId: 'registration.confirm',
        vars: {},
      });
      return created;
    });

    const tokens = await this.tokens.issueSession(this.auth.claimsFrom(user));
    return { user: this.auth.buildSessionUser(user), tokens };
  }

  /** Branch 2 — existing user: associate an owned subject with the link's trainer (FR-018). */
  async associateExisting(
    code: string,
    principal: SessionPrincipal,
    dto: JoinAssociateDto,
  ): Promise<{ association: AssociationResult; context: { subjectProfileId: string; trainerId: string } }> {
    // FR-026: a logged-in child joining a NEW trainer is blocked; the parent is emailed a CTA.
    if (principal.isMinor) {
      await this.notifyParentBlocked(principal);
      throw new AppException(AppErrorCode.MINOR_FORBIDDEN);
    }

    return this.db.transaction(async (tx) => {
      const link = await this.lockValidLink(tx, code);

      // M1/FR-029/BR-011: coach invites ('unique', single-use) are redeemed only by registerNew
      // creating a brand-new account. An already-logged-in user cannot self-convert to a coach in
      // Epic-01 — reject rather than silently create a player association (wrong role) and leave
      // the single-use link unconsumed (leak).
      if (link.type === 'unique') {
        throw new AppException(AppErrorCode.VALIDATION_ERROR, {
          details: [{ field: 'code', message: 'This invite must be redeemed by creating an account.' }],
        });
      }

      let subjectProfileId = dto.subjectProfileId;
      if (!subjectProfileId) {
        const [self] = await tx
          .select({ id: playerProfiles.id })
          .from(playerProfiles)
          .where(and(eq(playerProfiles.userId, principal.id), eq(playerProfiles.isSelf, true)))
          .limit(1);
        if (!self) throw new AppException(AppErrorCode.NOT_FOUND);
        subjectProfileId = self.id;
      } else {
        const [prof] = await tx
          .select()
          .from(playerProfiles)
          .where(eq(playerProfiles.id, subjectProfileId))
          .limit(1);
        if (!prof || (prof.userId !== principal.id && prof.parentUserId !== principal.id)) {
          throw new AppException(AppErrorCode.TENANT_FORBIDDEN);
        }
      }

      const association = await this.associations.associatePlayer(tx, {
        trainerId: link.trainerId,
        playerProfileId: subjectProfileId,
        viaShareLinkId: link.id,
      });
      await tx
        .update(shareLinks)
        .set({ useCount: link.useCount + 1, updatedAt: new Date() })
        .where(eq(shareLinks.id, link.id));
      return { association, context: { subjectProfileId, trainerId: link.trainerId } };
    });
  }

  /** Loads a link FOR UPDATE and maps its status to the right error. */
  private async lockValidLink(tx: DrizzleDB, code: string) {
    const [link] = await tx.select().from(shareLinks).where(eq(shareLinks.code, code)).for('update').limit(1);
    if (!link) throw new AppException(AppErrorCode.NOT_FOUND);
    const status = computeJoinStatus(link, new Date());
    if (status === 'EXPIRED') throw new AppException(AppErrorCode.SHARELINK_EXPIRED);
    if (status === 'USED') throw new AppException(AppErrorCode.SHARELINK_USED);
    if (status === 'INVALID') throw new AppException(AppErrorCode.NOT_FOUND);
    return link;
  }

  private async notifyParentBlocked(principal: SessionPrincipal): Promise<void> {
    if (!principal.managedByParentUserId) return;
    const [parent] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, principal.managedByParentUserId))
      .limit(1);
    if (!parent) return;
    const base = this.config.get('APP_BASE_URL', 'http://localhost:5173');
    // Committed in its own tx (the main action is rejected).
    await this.db.transaction((tx) =>
      this.outbox.enqueue(tx, 'email.sharelink.blocked-parent', {
        to: parent.email,
        templateId: 'sharelink.blocked-parent',
        vars: { link: `${base}/family` },
      }),
    );
  }
}
