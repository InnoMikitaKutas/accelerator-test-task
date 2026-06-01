import { Injectable } from '@nestjs/common';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { PasswordService } from '@shared/auth/password.service';
import { AssociationService } from '@modules/sharelinks/association.service';
import { computeJoinStatus } from '@modules/sharelinks/sharelink.util';
import { FamilyRepository, PlayerProfileRow } from './family.repository';
import {
  ChildSummaryDto,
  ChildTrainerAssocDto,
  CreateChildDto,
  EnableChildLoginDto,
  FamilyResponseDto,
  TokenSettingDto,
  UpdateChildDto,
} from './dto/family.dto';

@Injectable()
export class FamilyService {
  constructor(
    private readonly repo: FamilyRepository,
    private readonly passwords: PasswordService,
    private readonly associations: AssociationService,
  ) {}

  /** FR-027 — Zone-1 roster: self + children (with associations + token setting) + pending count. */
  async getFamily(parentUserId: string): Promise<FamilyResponseDto> {
    const self = await this.repo.getSelf(parentUserId);
    const children = await this.repo.listChildren(parentUserId);
    const trainers = await this.repo.listActiveTrainers(children.map((c) => c.id));
    const pendingApprovals = await this.repo.countPending(parentUserId);

    const childSummaries: ChildSummaryDto[] = [];
    for (const c of children) {
      childSummaries.push(
        this.toChildSummary(
          c,
          parentUserId,
          trainers.filter((t) => t.playerProfileId === c.id),
          await this.repo.getTokenSetting(c.id),
        ),
      );
    }

    return {
      self: self
        ? { profileId: self.id, firstName: self.firstName, lastName: self.lastName, isSelf: true }
        : null,
      children: childSummaries,
      pendingApprovals,
    };
  }

  /** FR-021/BR-006/013 — create child (age 1–18, duplicate warning). */
  async createChild(parentUserId: string, dto: CreateChildDto): Promise<ChildSummaryDto> {
    if (!dto.confirmDuplicate && (await this.repo.hasDuplicate(parentUserId, dto.firstName, dto.lastName, dto.age))) {
      throw new AppException(AppErrorCode.DUPLICATE_CHILD_WARNING);
    }
    const child = await this.repo.createChild({
      userId: parentUserId,
      parentUserId,
      isChild: true,
      firstName: dto.firstName,
      lastName: dto.lastName,
      age: dto.age,
      gender: dto.gender,
      school: dto.school,
    });
    return this.toChildSummary(child, parentUserId, [], false);
  }

  async getChild(parentUserId: string, childId: string): Promise<ChildSummaryDto> {
    const child = await this.requireChild(parentUserId, childId);
    const trainers = await this.repo.listActiveTrainers([childId]);
    return this.toChildSummary(child, parentUserId, trainers, await this.repo.getTokenSetting(childId));
  }

  async updateChild(parentUserId: string, childId: string, dto: UpdateChildDto): Promise<ChildSummaryDto> {
    await this.requireChild(parentUserId, childId);
    const child = await this.repo.updateChild(childId, dto);
    const trainers = await this.repo.listActiveTrainers([childId]);
    return this.toChildSummary(child, parentUserId, trainers, await this.repo.getTokenSetting(childId));
  }

  /** Minor-login provisioning (chosen model: children can log in). */
  async enableChildLogin(parentUserId: string, childId: string, dto: EnableChildLoginDto): Promise<ChildSummaryDto> {
    const child = await this.requireChild(parentUserId, childId);
    const email = dto.email.toLowerCase();
    if (await this.repo.findUserByEmail(email)) throw new AppException(AppErrorCode.EMAIL_EXISTS);
    await this.repo.enableChildLogin(childId, {
      email,
      passwordHash: await this.passwords.hash(dto.password),
      role: 'PLAYER',
      isMinor: true,
      managedByParentUserId: parentUserId,
      emailVerified: true, // parent-provisioned
      firstName: child.firstName,
      lastName: child.lastName,
    });
    const updated = await this.repo.findChild(parentUserId, childId);
    const trainers = await this.repo.listActiveTrainers([childId]);
    return this.toChildSummary(updated!, parentUserId, trainers, await this.repo.getTokenSetting(childId));
  }

  /** FR-023 — add a child↔trainer association (by trainerId or ShareLink code). Idempotent. */
  async addTrainer(parentUserId: string, childId: string, dto: ChildTrainerAssocDto) {
    await this.requireChild(parentUserId, childId);
    let trainerId = dto.trainerId;
    let viaShareLinkId: string | undefined;

    if (!trainerId && dto.code) {
      const link = await this.repo.findShareLinkByCode(dto.code);
      if (!link) throw new AppException(AppErrorCode.NOT_FOUND);
      const status = computeJoinStatus(link, new Date());
      if (status === 'EXPIRED') throw new AppException(AppErrorCode.SHARELINK_EXPIRED);
      if (status === 'USED') throw new AppException(AppErrorCode.SHARELINK_USED);
      if (status === 'INVALID') throw new AppException(AppErrorCode.NOT_FOUND);
      trainerId = link.trainerId;
      viaShareLinkId = link.id;
    }
    if (!trainerId) throw new AppException(AppErrorCode.VALIDATION_ERROR, {
      details: [{ field: 'trainerId', message: 'trainerId or code is required' }],
    });
    if (!(await this.repo.trainerExists(trainerId))) throw new AppException(AppErrorCode.NOT_FOUND);

    const result = await this.repo.runScopedTo(trainerId, (tx) =>
      this.associations.associatePlayer(tx, { trainerId: trainerId as string, playerProfileId: childId, viaShareLinkId }),
    );
    return result;
  }

  /** FR-023 — remove association (soft delete + RSVP-cancel outbox). */
  async removeTrainer(parentUserId: string, childId: string, trainerId: string): Promise<void> {
    await this.requireChild(parentUserId, childId);
    await this.repo.runScopedTo(trainerId, (tx) =>
      this.associations.removeAssociation(tx, { trainerId, playerProfileId: childId }),
    );
  }

  /** FR-024/BR-008 — per-child token-approval toggle. */
  async setTokenSetting(parentUserId: string, childId: string, dto: TokenSettingDto) {
    await this.requireChild(parentUserId, childId);
    await this.repo.setTokenSetting(childId, dto.allowTokenWithoutApproval);
    return { childProfileId: childId, allowTokenWithoutApproval: dto.allowTokenWithoutApproval };
  }

  private async requireChild(parentUserId: string, childId: string): Promise<PlayerProfileRow> {
    const child = await this.repo.findChild(parentUserId, childId);
    if (!child) throw new AppException(AppErrorCode.NOT_FOUND);
    return child;
  }

  private toChildSummary(
    c: PlayerProfileRow,
    parentUserId: string,
    trainers: { trainerId: string; name: string }[],
    allowToken: boolean,
  ): ChildSummaryDto {
    return {
      profileId: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      age: c.age,
      gender: c.gender,
      hasLogin: c.userId !== parentUserId, // a separate login User owns the profile once enabled
      allowTokenWithoutApproval: allowToken,
      trainers: trainers.map((t) => ({ trainerId: t.trainerId, name: t.name })),
    };
  }
}
