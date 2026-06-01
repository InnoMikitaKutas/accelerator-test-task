import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContextRefDto } from '@shared/common/dto/context-ref.dto';

export class TrainerChannelDto {
  @ApiProperty() trainerId: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['active', 'inactive'] }) status: 'active' | 'inactive';
}

export class SubjectDto {
  @ApiProperty() profileId: string;
  @ApiProperty() displayName: string;
  @ApiProperty() isSelf: boolean;
  @ApiProperty() isChild: boolean;
  @ApiProperty({ type: [TrainerChannelDto] }) trainers: TrainerChannelDto[];
}

export class ContextsResponseDto {
  @ApiProperty({ type: [SubjectDto] }) subjects: SubjectDto[];
  @ApiPropertyOptional({ type: ContextRefDto, nullable: true }) defaultContext: ContextRefDto | null;
}

/** Body for PUT /me/contexts/default — same shape/validation as ContextRefDto. */
export class SetDefaultContextDto extends ContextRefDto {}
