import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { KeysetQueryDto } from '@shared/common/pagination/keyset-query.dto';
import type { Role, UserStatus } from '@shared/database/schema';

export class UserListQueryDto extends KeysetQueryDto {
  @ApiPropertyOptional({ description: 'Free-text on name/email' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: ['SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER'] })
  @IsOptional()
  @IsIn(['SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER'])
  role?: Role;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'DELETED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'DELETED'])
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Filter players/coaches under a trainer org (trainer_profiles.id)' })
  @IsOptional()
  @IsUUID()
  trainerId?: string;

  @ApiPropertyOptional({ enum: ['createdAt:desc', 'createdAt:asc'] })
  @IsOptional()
  @IsIn(['createdAt:desc', 'createdAt:asc'])
  sort?: string;
}
