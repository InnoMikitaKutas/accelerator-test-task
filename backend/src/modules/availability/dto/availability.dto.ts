import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { KeysetQueryDto } from '@shared/common/pagination/keyset-query.dto';
import { TIME_REGEX } from '@shared/common/validation/patterns';

export class TimeSlotDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0=Sunday … 6=Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '09:00', description: 'HH:mm 24h' })
  @Matches(TIME_REGEX)
  startTime: string;

  @ApiProperty({ example: '11:30' })
  @Matches(TIME_REGEX)
  endTime: string;
}

export class SetAvailabilityDto {
  @ApiProperty({ type: [TimeSlotDto], description: 'Full replacement set (PUT semantics)' })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  slots: TimeSlotDto[];
}

export class AvailabilityResponseDto {
  @ApiProperty({ enum: ['player', 'coach'] }) subjectType: 'player' | 'coach';
  @ApiProperty() subjectId: string;
  @ApiProperty({ type: [TimeSlotDto] }) slots: TimeSlotDto[];
  @ApiProperty() updatedAt: string;
}

export class TrainerAvailabilityQueryDto extends KeysetQueryDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ example: '17:00', description: 'Players available at/after this time' })
  @IsOptional()
  @Matches(TIME_REGEX)
  availableAt?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class OverrideDto {
  @ApiProperty({ description: 'Event the coach is assigned to (linkage owned by Epic-02)' })
  @IsUUID()
  eventId: string;

  @ApiProperty({ description: 'Coach PROFILE id (matches trainer_coach_associations.coach_profile_id)' })
  @IsUUID()
  coachId: string;

  @ApiProperty({ description: 'Required reason — logged to AvailabilityOverride (FR-031)' })
  @IsString()
  // Trim BEFORE @IsNotEmpty so a whitespace-only reason is rejected (L5).
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
