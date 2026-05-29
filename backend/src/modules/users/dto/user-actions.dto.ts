import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class DeactivateUserDto {
  @ApiPropertyOptional() @IsOptional() @MaxLength(500) reason?: string;
}

export class GdprDeleteDto {
  @ApiProperty({ description: 'Required justification — written to UserDeletionLog' })
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiProperty({ description: 'Must equal the target email — confirms intent (irreversible)' })
  @IsEmail()
  confirmEmail: string;
}

export class GdprDeleteResultDto {
  @ApiProperty() anonymized: boolean;
  @ApiProperty() deletionLogId: string;
  @ApiProperty({ description: 'Analytics rows retained; render as "Deleted User"' })
  historyRetained: true;
}
