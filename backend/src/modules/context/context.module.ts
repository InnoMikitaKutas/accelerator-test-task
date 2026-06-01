import { Module } from '@nestjs/common';
import { ContextController } from './context.controller';
import { ContextService } from './context.service';
import { ContextRepository } from './context.repository';

@Module({
  controllers: [ContextController],
  providers: [ContextService, ContextRepository],
})
export class ContextModule {}
