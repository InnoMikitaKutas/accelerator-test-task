import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { HEX_COLOR_REGEX } from '@shared/common/validation/patterns';

export class UpdateBrandingDto {
  @ApiProperty({ example: '#1A73E8', description: 'Primary brand color, 6-digit hex' })
  @Matches(HEX_COLOR_REGEX, { message: 'Must be a 6-digit hex color, e.g. #1A73E8' })
  primaryColorHex: string;
}

export class BrandingResponseDto {
  @ApiProperty() trainerId: string;
  @ApiPropertyOptional({ nullable: true }) logoUrl: string | null;
  @ApiProperty({ example: '#1A73E8' }) primaryColorHex: string;
  @ApiProperty() updatedAt: string;
}
