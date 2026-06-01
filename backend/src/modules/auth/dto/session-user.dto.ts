import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContextRefDto } from '@shared/common/dto/context-ref.dto';
import type { Role } from '@shared/database/schema';

/** Authenticated principal returned by login / refresh / me. NEVER contains tokens (cookies carry them). */
export class SessionUserDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER'] }) role: Role;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty({ description: 'Temp-password users must change before proceeding' })
  mustChangePassword: boolean;

  @ApiPropertyOptional({
    type: () => ContextRefDto,
    nullable: true,
    description: "Seed for the client's initial context (PLAYER only)",
  })
  defaultContext?: ContextRefDto | null;

  @ApiPropertyOptional({ nullable: true, description: 'Admin id when this session is impersonated' })
  impersonatedBy?: string | null;
}
