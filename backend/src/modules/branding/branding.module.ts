import { Module } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { BrandingRepository } from './branding.repository';

@Module({
  controllers: [BrandingController],
  providers: [BrandingService, BrandingRepository],
})
export class BrandingModule {}
