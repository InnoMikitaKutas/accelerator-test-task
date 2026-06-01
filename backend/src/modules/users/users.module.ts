import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UserAdminService } from './user-admin.service';
import { AnonymizationService } from './anonymization.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [UsersController],
  providers: [UserAdminService, AnonymizationService, UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
