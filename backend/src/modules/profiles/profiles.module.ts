import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfilesRepository } from './profiles.repository';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, ProfilesRepository],
  exports: [ProfilesRepository],
})
export class ProfilesModule {}
