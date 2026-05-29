import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class FieldErrorDto {
  @ApiProperty() field: string;
  @ApiProperty() message: string;
}

/** Swagger schema for every non-2xx response (api-spec §Swagger conventions). */
export class ErrorResponseDto {
  @ApiProperty({ example: 409 }) statusCode: number;
  @ApiProperty({ example: 'Conflict' }) error: string;
  @ApiProperty({ example: 'EMAIL_EXISTS' }) errorCode: string;
  @ApiProperty({ example: 'An account with this email already exists.' }) message: string;
  @ApiPropertyOptional({ type: [FieldErrorDto], description: 'Present only for VALIDATION_ERROR' })
  details?: FieldErrorDto[];
}
