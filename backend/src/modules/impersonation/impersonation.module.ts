import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';
import { ImpersonationRepository } from './impersonation.repository';
import { ImpersonationSweep } from './impersonation.sweep';

@Module({
  imports: [AuthModule], // reuses AuthService.claimsFrom
  controllers: [ImpersonationController],
  providers: [ImpersonationService, ImpersonationRepository, ImpersonationSweep],
})
export class ImpersonationModule {}
