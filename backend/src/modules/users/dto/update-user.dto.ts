import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches, MaxLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '@shared/common/validation/patterns';

/** email & role are immutable here (FR-038 read-only rule). */
export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;
}
