import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { KeysetQueryDto } from '@shared/common/pagination/keyset-query.dto';

export class StartImpersonationDto {
  @ApiPropertyOptional({ description: 'Support reason — written to ImpersonationLog' })
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

export class ImpersonationStateDto {
  @ApiProperty() impersonating: boolean;
  @ApiPropertyOptional({ nullable: true }) targetUserId: string | null;
  @ApiPropertyOptional({ nullable: true }) targetDisplayName: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Hard expiry (1h)' }) expiresAt: string | null;
}

export class ImpersonationHistoryQueryDto extends KeysetQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() adminId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() targetUserId?: string;
  @ApiPropertyOptional({ description: 'ISO date lower bound' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}

export class ImpersonationLogDto {
  @ApiProperty() id: string;
  @ApiProperty() adminId: string;
  @ApiProperty() adminEmail: string;
  @ApiProperty() targetUserId: string;
  @ApiProperty() targetEmail: string;
  @ApiProperty() startedAt: string;
  @ApiPropertyOptional({ nullable: true }) endedAt: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Seconds' }) durationSec: number | null;
}
