import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '@shared/common/validation/patterns';

export class CreateShareLinkDto {
  @ApiPropertyOptional({ description: 'Optional human label for the trainer dashboard' })
  @IsOptional()
  @MaxLength(120)
  label?: string;
}

export class CoachInviteDto {
  @ApiProperty({ description: 'Coach email the invite is bound to' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional() @IsOptional() @MaxLength(120) personalNote?: string;
}

export class ShareLinkResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['static', 'unique'] }) type: 'static' | 'unique';
  @ApiProperty({ description: 'Shareable URL, e.g. https://app/join/AB12CD' }) url: string;
  @ApiProperty() code: string;
  @ApiPropertyOptional({ nullable: true }) targetEmail: string | null;
  @ApiPropertyOptional({ nullable: true }) expiresAt: string | null;
  @ApiProperty() useCount: number;
  @ApiPropertyOptional({ nullable: true }) maxUses: number | null;
  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'ACTIVE'] }) status: string;
  @ApiProperty() active: boolean;
  @ApiProperty() createdAt: string;
}

class JoinBrandingDto {
  @ApiPropertyOptional({ nullable: true }) logoUrl: string | null;
  @ApiProperty() primaryColorHex: string;
}

export class JoinResolveDto {
  @ApiProperty() code: string;
  @ApiProperty({ enum: ['static', 'unique'] }) type: 'static' | 'unique';
  @ApiProperty({ enum: ['VALID', 'EXPIRED', 'USED', 'INVALID'] }) status: string;
  @ApiProperty() trainerDisplayName: string;
  @ApiPropertyOptional({ type: JoinBrandingDto, nullable: true }) branding: JoinBrandingDto | null;
  @ApiProperty({ description: 'true ⇒ caller must register (no session)' }) requiresAccount: boolean;
  @ApiPropertyOptional({ nullable: true }) prefillEmail: string | null;
}

export class JoinRegisterDto {
  @ApiProperty() @IsEmail() @MaxLength(255) email: string;
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Password must contain a letter and a number' })
  password: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) firstName: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) lastName: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;
}

export class JoinAssociateDto {
  @ApiPropertyOptional({ description: 'Which owned subject to associate (defaults to self)' })
  @IsOptional()
  @IsUUID()
  subjectProfileId?: string;
}
