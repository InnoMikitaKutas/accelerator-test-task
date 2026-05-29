import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { StorageService } from '@shared/storage/storage.service';
import { ImageService } from '@shared/storage/image.service';
import { UploadedFile } from '@shared/storage/file-validation';
import { SessionPrincipal } from '@shared/context/request-context';
import { ProfilesRepository } from './profiles.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  PhotoUploadResultDto,
  ProfileDetails,
  ProfileResponseDto,
} from './dto/profile-response.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly repo: ProfilesRepository,
    private readonly storage: StorageService,
    private readonly images: ImageService,
    private readonly config: ConfigService,
  ) {}

  /** FR-038 — own profile, role-shaped. */
  async getMine(principal: SessionPrincipal): Promise<ProfileResponseDto> {
    const user = await this.repo.getUser(principal.id);
    if (!user) throw new AppException(AppErrorCode.UNAUTHENTICATED);
    return {
      id: user.id,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      photoUrl: user.photoUrl,
      thumbnailUrl: user.thumbnailUrl,
      details: await this.detailsFor(principal),
    };
  }

  /** FR-038 — update own profile; applies only role-appropriate fields. */
  async updateMine(principal: SessionPrincipal, dto: UpdateProfileDto): Promise<ProfileResponseDto> {
    const common = clean({ firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone });
    await this.repo.updateUserCommon(principal.id, common);

    if (principal.role === 'TRAINER') {
      await this.repo.updateTrainerProfile(
        principal.id,
        clean({ businessName: dto.businessName, businessAddress: dto.businessAddress }),
      );
    } else if (principal.role === 'COACH') {
      await this.repo.updateCoachProfile(
        principal.id,
        clean({
          bio: dto.bio,
          credentials: dto.credentials,
          certifications: dto.certifications,
          publicVisible: dto.publicVisible,
        }),
      );
    } else if (principal.role === 'PLAYER') {
      await this.repo.updateSelfPlayerProfile(
        principal.id,
        clean({
          gender: dto.gender,
          school: dto.school,
          emergencyContactName: dto.emergencyContact?.name,
          emergencyContactPhone: dto.emergencyContact?.phone,
        }),
      );
    }
    return this.getMine(principal);
  }

  /** FR-038 — avatar upload → original + thumbnail via sharp + storage. */
  async uploadPhoto(principal: SessionPrincipal, file: UploadedFile): Promise<PhotoUploadResultDto> {
    const { original, thumbnail } = await this.images.processAvatar(file.buffer);
    const base = `avatars/${principal.id}/${randomUUID()}`;
    const o = await this.storage.put(`${base}.${original.ext}`, original.buffer, original.contentType);
    const t = await this.storage.put(`${base}-thumb.${thumbnail.ext}`, thumbnail.buffer, thumbnail.contentType);
    await this.repo.setUserPhoto(principal.id, o.url, t.url);
    return { photoUrl: o.url, thumbnailUrl: t.url };
  }

  private async detailsFor(principal: SessionPrincipal): Promise<ProfileDetails> {
    if (principal.role === 'TRAINER') {
      const p = await this.repo.getTrainerProfile(principal.id);
      return {
        kind: 'trainer',
        businessName: p?.businessName ?? '',
        businessAddress: p?.businessAddress ?? null,
      };
    }
    if (principal.role === 'COACH') {
      const p = await this.repo.getCoachProfile(principal.id);
      return {
        kind: 'coach',
        bio: p?.bio ?? null,
        credentials: p?.credentials ?? [],
        certifications: p?.certifications ?? [],
        publicVisible: p?.publicVisible ?? false,
      };
    }
    // PLAYER (parent's self profile) — SUPER_ADMIN has no role profile; return a minimal player block.
    const p = await this.repo.getSelfPlayerProfile(principal.id);
    return {
      kind: 'player',
      profileId: p?.id ?? '',
      gender: p?.gender ?? 'UNSPECIFIED',
      school: p?.school ?? null,
      skillLevel: p?.skillLevel ?? null,
      emergencyContact: {
        name: p?.emergencyContactName ?? null,
        phone: p?.emergencyContactPhone ?? null,
      },
    };
  }
}

/** Drop undefined keys so partial updates don't overwrite columns with null. */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
