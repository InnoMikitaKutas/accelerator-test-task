import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { Paginated } from '@shared/common/pagination/paginated-response.dto';
import { PasswordService } from '@shared/auth/password.service';
import { AuditService } from '@shared/audit/audit.service';
import { generateRawToken, hashToken } from '@shared/auth/token-hash';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-query.dto';
import { DeactivateUserDto } from './dto/user-actions.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { CampConversionDto } from './dto/camp-conversion.dto';
import { UserRow, UsersRepository } from './users.repository';

const INVITE_TTL_SEC = 72 * 3600;

@Injectable()
export class UserAdminService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** FR-011/BR-002 — create a Trainer (User + TrainerProfile) with invite or temp password. */
  async createTrainer(dto: CreateTrainerDto): Promise<UserResponseDto> {
    const email = dto.email.toLowerCase();
    if (await this.repo.findByEmail(email)) throw new AppException(AppErrorCode.EMAIL_EXISTS);

    const mode = dto.onboardingMode ?? 'INVITE';
    const base = this.config.get('APP_BASE_URL', 'http://localhost:5173');

    let passwordHash: string;
    let mustChangePassword: boolean;
    let resetTokenHash: string | undefined;
    let resetTokenExpiresAt: Date | undefined;
    let outboxVars: Record<string, string>;

    if (mode === 'TEMP_PASSWORD') {
      const temp = this.passwords.generateTemp();
      passwordHash = await this.passwords.hash(temp);
      mustChangePassword = true;
      outboxVars = { tempPassword: temp, link: `${base}/login` };
    } else {
      // INVITE: unusable password until the invite link sets one via the reset flow.
      passwordHash = await this.passwords.hash(generateRawToken());
      mustChangePassword = false;
      const raw = generateRawToken();
      resetTokenHash = hashToken(raw);
      resetTokenExpiresAt = new Date(Date.now() + INVITE_TTL_SEC * 1000);
      outboxVars = { link: `${base}/set-password?token=${raw}` };
    }

    const user = await this.repo.createTrainer({
      user: {
        email,
        passwordHash,
        role: 'TRAINER',
        emailVerified: true, // admin-created accounts are trusted
        mustChangePassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
      businessName: dto.businessName,
      businessAddress: dto.businessAddress,
      resetTokenHash,
      resetTokenExpiresAt,
      outbox: {
        type: 'email.trainer.invite',
        payload: { to: email, templateId: 'trainer.invite', vars: outboxVars },
      },
    });

    await this.audit.log({ action: 'user.create_trainer', entityType: 'user', entityId: user.id });
    return this.toResponse(user);
  }

  async list(query: UserListQueryDto): Promise<Paginated<UserResponseDto>> {
    const page = await this.repo.list(query);
    return {
      items: page.items.map((r) => this.toResponse(r)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async get(id: string): Promise<UserResponseDto> {
    const user = await this.repo.findById(id);
    if (!user) throw new AppException(AppErrorCode.NOT_FOUND);
    return this.toResponse(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const updated = await this.repo.update(id, dto);
    if (!updated) throw new AppException(AppErrorCode.NOT_FOUND);
    return this.toResponse(updated);
  }

  /** FR-013/BR-010 — soft delete (reversible). */
  async deactivate(id: string, dto: DeactivateUserDto): Promise<UserResponseDto> {
    const user = await this.repo.findById(id);
    if (!user) throw new AppException(AppErrorCode.NOT_FOUND);
    const updated = await this.repo.setStatus(id, 'INACTIVE');
    await this.audit.log({
      action: 'user.deactivate',
      entityType: 'user',
      entityId: id,
      metadata: dto.reason ? { reason: dto.reason } : undefined,
    });
    return this.toResponse(updated!);
  }

  async reactivate(id: string): Promise<UserResponseDto> {
    const user = await this.repo.findById(id);
    if (!user) throw new AppException(AppErrorCode.NOT_FOUND);
    const updated = await this.repo.setStatus(id, 'ACTIVE');
    await this.audit.log({ action: 'user.reactivate', entityType: 'user', entityId: id });
    return this.toResponse(updated!);
  }

  /**
   * FR-040 — Camp→User conversion boundary stub. Find-or-create the user; the trainer
   * association is wired by Epic-08's full flow.
   */
  async campImport(dto: CampConversionDto): Promise<{ userId: string; created: boolean; associated: boolean }> {
    const email = dto.email.toLowerCase();
    const existing = await this.repo.findByEmail(email);
    if (existing) return { userId: existing.id, created: false, associated: false };
    const user = await this.repo.createUser({
      email,
      passwordHash: await this.passwords.hash(generateRawToken()),
      role: 'PLAYER',
      emailVerified: false,
      mustChangePassword: false,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    // Player profile + trainer association are finalized by Epic-08's full conversion flow.
    return { userId: user.id, created: true, associated: false };
  }

  private toResponse(u: UserRow): UserResponseDto {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      status: u.status,
      emailVerified: u.emailVerified,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    };
  }
}
