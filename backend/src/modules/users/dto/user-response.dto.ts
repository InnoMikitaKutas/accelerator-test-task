import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Role, UserStatus } from '@shared/database/schema';

export class UserResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string; // "deleted-user-<uuid>@anon.invalid" after GDPR delete
  @ApiProperty() firstName: string; // "Deleted" after GDPR delete
  @ApiProperty() lastName: string; // "User"
  @ApiProperty({ enum: ['SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER'] }) role: Role;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'DELETED'] }) status: UserStatus;
  @ApiProperty() emailVerified: boolean;
  @ApiPropertyOptional({ nullable: true }) lastLoginAt: string | null;
  @ApiProperty() createdAt: string;
}
