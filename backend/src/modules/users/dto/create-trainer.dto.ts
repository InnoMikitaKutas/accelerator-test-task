import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_REGEX } from '@shared/common/validation/patterns';

export class CreateTrainerDto {
  @ApiProperty() @IsEmail() @MaxLength(255) email: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) firstName: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) lastName: string;

  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;

  @ApiProperty({ description: 'Trainer business / organization name' })
  @IsNotEmpty()
  @MaxLength(200)
  businessName: string;

  @ApiPropertyOptional() @IsOptional() @MaxLength(500) businessAddress?: string;

  @ApiPropertyOptional({
    default: 'INVITE',
    enum: ['INVITE', 'TEMP_PASSWORD'],
    description: 'Emailed invite link or admin-set temp password (FR-005)',
  })
  @IsOptional()
  @IsIn(['INVITE', 'TEMP_PASSWORD'])
  onboardingMode?: 'INVITE' | 'TEMP_PASSWORD';
}
