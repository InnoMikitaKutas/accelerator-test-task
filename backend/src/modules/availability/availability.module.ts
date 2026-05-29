import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AvailabilityRepository } from './availability.repository';

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService, AvailabilityRepository],
})
export class AvailabilityModule {}
