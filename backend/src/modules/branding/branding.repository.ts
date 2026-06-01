import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { SYSTEM_DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { trainerBranding, trainerProfiles } from '@shared/database/schema';
import { TenancyService } from '@shared/tenancy/tenancy.service';

export type BrandingRow = typeof trainerBranding.$inferSelect;

@Injectable()
export class BrandingRepository {
  constructor(
    private readonly tenancy: TenancyService,
    @Inject(SYSTEM_DRIZZLE) private readonly system: DrizzleDB,
  ) {}

  /** Own-org read (tenant-scoped). */
  getOwn(): Promise<BrandingRow | undefined> {
    return this.tenancy.runScoped(async (tx) => {
      const trainerId = this.tenancy.currentTrainerId();
      const [row] = await tx
        .select()
        .from(trainerBranding)
        .where(eq(trainerBranding.trainerId, trainerId))
        .limit(1);
      return row;
    });
  }

  /** Own-org upsert (tenant-scoped). */
  upsert(patch: { primaryColorHex?: string; logoUrl?: string }): Promise<BrandingRow> {
    return this.tenancy.runScoped(async (tx) => {
      const trainerId = this.tenancy.currentTrainerId();
      const [row] = await tx
        .insert(trainerBranding)
        .values({ trainerId, ...patch })
        .onConflictDoUpdate({
          target: trainerBranding.trainerId,
          set: { ...patch, updatedAt: new Date() },
        })
        .returning();
      return row;
    });
  }

  /** Cross-tenant read for theming any trainer (system pool). */
  async getByTrainer(trainerId: string): Promise<BrandingRow | undefined> {
    const [row] = await this.system
      .select()
      .from(trainerBranding)
      .where(eq(trainerBranding.trainerId, trainerId))
      .limit(1);
    return row;
  }

  async trainerExists(trainerId: string): Promise<boolean> {
    const [row] = await this.system
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.id, trainerId))
      .limit(1);
    return !!row;
  }
}
