import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '@shared/common/validation/patterns';

export class EmergencyContactDto {
  @ApiPropertyOptional() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional() @Matches(PHONE_REGEX, { message: PHONE_MESSAGE }) phone: string;
}

/**
 * Combined self-service profile update (api-spec §Module C). The service applies only the fields
 * relevant to the caller's role. `email`, `role`, `skillLevel` are intentionally absent → the
 * global whitelist rejects any attempt to set them (FR-038 read-only rule).
 */
export class UpdateProfileDto {
  // Common (users table)
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;

  // Trainer
  @ApiPropertyOptional() @IsOptional() @MaxLength(200) businessName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(500) businessAddress?: string;

  // Coach
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @MaxLength(2000) bio?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  credentials?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];
  @ApiPropertyOptional({ description: 'Coach public-profile visibility (FR-032)' })
  @IsOptional()
  @IsBoolean()
  publicVisible?: boolean;

  // Player (self)
  @ApiPropertyOptional({ enum: ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] })
  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED';
  @ApiPropertyOptional() @IsOptional() @MaxLength(200) school?: string;
  @ApiPropertyOptional({ type: EmergencyContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;
}
