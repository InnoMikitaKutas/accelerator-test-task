import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] as const;

export class CreateChildDto {
  @ApiProperty() @IsNotEmpty() @MaxLength(100) firstName: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) lastName: string;
  @ApiProperty({ minimum: 1, maximum: 18, description: 'All under-18 are parent-managed (BR-006)' })
  @IsInt()
  @Min(1)
  @Max(18)
  age: number;
  @ApiProperty({ enum: GENDERS }) @IsIn(GENDERS) gender: (typeof GENDERS)[number];
  @ApiPropertyOptional() @IsOptional() @MaxLength(200) school?: string;
  @ApiPropertyOptional({ description: 'Acknowledge the duplicate-name+age warning and proceed' })
  @IsOptional()
  @IsBoolean()
  confirmDuplicate?: boolean;
}

export class UpdateChildDto {
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 18 }) @IsOptional() @IsInt() @Min(1) @Max(18) age?: number;
  @ApiPropertyOptional({ enum: GENDERS }) @IsOptional() @IsIn(GENDERS) gender?: (typeof GENDERS)[number];
  @ApiPropertyOptional() @IsOptional() @MaxLength(200) school?: string;
}

/** Parent-driven minor-login provisioning (chosen model: children can log in). */
export class EnableChildLoginDto {
  @ApiProperty() @IsEmail() @MaxLength(255) email: string;
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Password must contain a letter and a number' })
  password: string;
}

export class ChildTrainerAssocDto {
  @ApiPropertyOptional({ description: 'Associate via a ShareLink code…' })
  @ValidateIf((o) => !o.trainerId)
  @IsString()
  code?: string;
  @ApiPropertyOptional({ description: '…or directly by trainerId (one of code|trainerId required)' })
  @ValidateIf((o) => !o.code)
  @IsUUID()
  trainerId?: string;
}

export class TokenSettingDto {
  @ApiProperty({ description: 'true ⇒ tokens may be spent without parent approval (default false)' })
  @IsBoolean()
  allowTokenWithoutApproval: boolean;
}

export class PurchaseRequestDto {
  @ApiProperty() @IsUUID() childProfileId: string;
  @ApiProperty({ description: 'Event/item reference (resolved in Epic-02/05)' })
  @IsString()
  @MaxLength(120)
  itemRef: string;
  @ApiProperty({ enum: ['USD', 'TOKEN'] }) @IsIn(['USD', 'TOKEN']) paymentType: 'USD' | 'TOKEN';
  @ApiPropertyOptional({ description: 'Minor units; required when paymentType=USD' })
  @ValidateIf((o) => o.paymentType === 'USD')
  @IsInt()
  @Min(0)
  amount?: number;
  @ApiPropertyOptional() @IsOptional() @MaxLength(280) childNote?: string;
}

export class ApprovalDecisionDto {
  @ApiPropertyOptional() @IsOptional() @MaxLength(280) parentNote?: string;
}

export class ApprovalResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() childProfileId: string;
  @ApiProperty() childDisplayName: string;
  @ApiProperty() trainerId: string;
  @ApiProperty() itemRef: string;
  @ApiProperty({ enum: ['USD', 'TOKEN'] }) paymentType: string;
  @ApiPropertyOptional({ nullable: true }) amount: number | null;
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'DENIED', 'EXPIRED'] }) status: string;
  @ApiProperty() requestedAt: string;
  @ApiProperty({ description: '48h after requestedAt (BR-008)' }) expiresAt: string;
  @ApiPropertyOptional({ nullable: true }) respondedAt: string | null;
  @ApiPropertyOptional({ nullable: true }) parentNote: string | null;
}

export class ChildSummaryDto {
  @ApiProperty() profileId: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiPropertyOptional({ nullable: true }) age: number | null;
  @ApiProperty() gender: string;
  @ApiProperty({ description: 'Whether a constrained child login has been provisioned' })
  hasLogin: boolean;
  @ApiProperty({ description: 'Tokens spendable without approval?' }) allowTokenWithoutApproval: boolean;
  @ApiProperty({ type: [Object], description: 'Active trainer associations' })
  trainers: { trainerId: string; name: string }[];
}

export class PlayerProfileSummaryDto {
  @ApiProperty() profileId: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() isSelf: boolean;
}

export class FamilyResponseDto {
  @ApiPropertyOptional({ type: PlayerProfileSummaryDto, nullable: true })
  self: PlayerProfileSummaryDto | null;
  @ApiProperty({ type: [ChildSummaryDto] }) children: ChildSummaryDto[];
  @ApiProperty({ description: 'Count of PENDING approvals across all children' }) pendingApprovals: number;
}
