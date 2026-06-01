import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Role } from '@shared/database/schema';

export interface TrainerDetails {
  kind: 'trainer';
  businessName: string;
  businessAddress: string | null;
}
export interface CoachDetails {
  kind: 'coach';
  bio: string | null;
  credentials: string[];
  certifications: string[];
  publicVisible: boolean;
}
export interface PlayerDetails {
  kind: 'player';
  profileId: string;
  gender: string;
  school: string | null;
  skillLevel: string | null; // read-only
  emergencyContact: { name: string | null; phone: string | null };
}

export type ProfileDetails = TrainerDetails | CoachDetails | PlayerDetails;

export class ProfileResponseDto {
  @ApiProperty() id: string; // User id
  @ApiProperty({ enum: ['SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER'] }) role: Role;
  @ApiProperty() email: string; // read-only
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
  @ApiPropertyOptional({ nullable: true }) photoUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) thumbnailUrl: string | null;
  @ApiProperty({ type: Object, description: 'Role-specific block: trainer | coach | player' })
  details: ProfileDetails;
}

export class PhotoUploadResultDto {
  @ApiProperty() photoUrl: string;
  @ApiProperty() thumbnailUrl: string;
}
