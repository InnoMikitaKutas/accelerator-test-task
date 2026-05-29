import { Module } from '@nestjs/common';

/**
 * Root module. Wired incrementally per the implementation plan:
 * Phase 2 adds Config/CLS/Drizzle/Redis + the ordered global guard chain;
 * Phases 3–11 register the feature modules.
 */
@Module({})
export class AppModule {}
