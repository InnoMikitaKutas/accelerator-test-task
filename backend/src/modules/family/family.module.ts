import { Module } from '@nestjs/common';
import { SharelinksModule } from '@modules/sharelinks/sharelinks.module';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { PurchaseApprovalService } from './purchase-approval.service';
import { FamilyRepository } from './family.repository';

@Module({
  imports: [SharelinksModule], // reuses AssociationService
  controllers: [FamilyController],
  providers: [FamilyService, PurchaseApprovalService, FamilyRepository],
})
export class FamilyModule {}
