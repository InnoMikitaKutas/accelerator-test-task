import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';

/** Cross-module auth primitives (token + password services). Guards live in the global chain. */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService, PasswordService],
  exports: [TokenService, PasswordService, JwtModule],
})
export class AuthSharedModule {}
