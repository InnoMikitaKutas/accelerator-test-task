import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { KeysetQueryDto } from '@shared/common/pagination/keyset-query.dto';

export class ApprovalListQueryDto extends KeysetQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'DENIED', 'EXPIRED'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'DENIED', 'EXPIRED'])
  status?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() childProfileId?: string;
}
