import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsObject, IsOptional, IsUUID } from 'class-validator';

/** Camp→User conversion stub (FR-040). Full flow + payload schema owned by Epic-08. */
export class CampConversionDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsNotEmpty() firstName: string;
  @ApiProperty() @IsNotEmpty() lastName: string;

  @ApiProperty({ description: 'Trainer to auto-associate the converted user with' })
  @IsUUID()
  trainerId: string;

  @ApiPropertyOptional({ type: Object, description: 'Opaque camp pre-fill payload (Epic-08 schema)' })
  @IsOptional()
  @IsObject()
  prefill?: Record<string, unknown>;
}
