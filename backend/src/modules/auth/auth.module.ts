import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthRepository } from './auth.repository';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthPasswordService, AuthRepository],
  exports: [AuthService, AuthRepository],
})
export class AuthModule {}
