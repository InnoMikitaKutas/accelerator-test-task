import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { coachProfiles, playerProfiles, trainerProfiles, users } from '@shared/database/schema';

@Injectable()
export class ProfilesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getUser(userId: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return row;
  }

  async getTrainerProfile(userId: string) {
    const [row] = await this.db
      .select()
      .from(trainerProfiles)
      .where(eq(trainerProfiles.userId, userId))
      .limit(1);
    return row;
  }

  async getCoachProfile(userId: string) {
    const [row] = await this.db
      .select()
      .from(coachProfiles)
      .where(eq(coachProfiles.userId, userId))
      .limit(1);
    return row;
  }

  async getSelfPlayerProfile(userId: string) {
    const [row] = await this.db
      .select()
      .from(playerProfiles)
      .where(and(eq(playerProfiles.userId, userId), eq(playerProfiles.isSelf, true)))
      .limit(1);
    return row;
  }

  async updateUserCommon(
    userId: string,
    patch: Partial<{ firstName: string; lastName: string; phone: string }>,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async updateTrainerProfile(
    userId: string,
    patch: Partial<{ businessName: string; businessAddress: string }>,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.db
      .update(trainerProfiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(trainerProfiles.userId, userId));
  }

  async updateCoachProfile(
    userId: string,
    patch: Partial<{
      bio: string;
      credentials: string[];
      certifications: string[];
      publicVisible: boolean;
    }>,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.db
      .update(coachProfiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(coachProfiles.userId, userId));
  }

  async updateSelfPlayerProfile(
    userId: string,
    patch: Partial<{
      gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED';
      school: string;
      emergencyContactName: string;
      emergencyContactPhone: string;
    }>,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.db
      .update(playerProfiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(playerProfiles.userId, userId), eq(playerProfiles.isSelf, true)));
  }

  async setUserPhoto(userId: string, photoUrl: string, thumbnailUrl: string): Promise<void> {
    await this.db
      .update(users)
      .set({ photoUrl, thumbnailUrl, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}
