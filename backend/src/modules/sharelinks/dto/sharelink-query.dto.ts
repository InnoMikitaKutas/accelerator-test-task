import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { KeysetQueryDto } from '@shared/common/pagination/keyset-query.dto';
import { PHONE_MESSAGE, PHONE_REGEX } from '@shared/common/validation/patterns';

export class ShareLinkListQueryDto extends KeysetQueryDto {
  @ApiPropertyOptional({ enum: ['static', 'unique'] })
  @IsOptional()
  @IsIn(['static', 'unique'])
  type?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'ACTIVE'] })
  @IsOptional()
  @IsIn(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'ACTIVE'])
  status?: string;
}

/**
 * Combined body for POST /join/:code (optional-auth). New-user branch requires
 * email/password/firstName/lastName (enforced in the service); existing-user branch uses
 * subjectProfileId. Field-level validators still apply when a value is present.
 */
export class JoinBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Password must contain a letter and a number' })
  password?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subjectProfileId?: string;
}
