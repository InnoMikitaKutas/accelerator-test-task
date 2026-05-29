import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** A (subject, trainer) context pair (api-spec §Context Switching). Shared across modules. */
export class ContextRefDto {
  @ApiProperty() @IsUUID() subjectProfileId: string;
  @ApiProperty() @IsUUID() trainerId: string;
}
