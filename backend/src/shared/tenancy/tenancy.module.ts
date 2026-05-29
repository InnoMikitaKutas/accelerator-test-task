import { Global, Module } from '@nestjs/common';
import { TenancyService } from './tenancy.service';
import { ContextResolver } from './context-resolver';

@Global()
@Module({
  providers: [TenancyService, ContextResolver],
  exports: [TenancyService, ContextResolver],
})
export class TenancyModule {}
