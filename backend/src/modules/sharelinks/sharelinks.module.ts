import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { SharelinksController } from './sharelinks.controller';
import { JoinController } from './join.controller';
import { ShareLinkService } from './sharelink.service';
import { JoinService } from './join.service';
import { AssociationService } from './association.service';
import { ShareLinksRepository } from './sharelinks.repository';

@Module({
  imports: [AuthModule], // JoinService reuses AuthService (session building)
  controllers: [SharelinksController, JoinController],
  providers: [ShareLinkService, JoinService, AssociationService, ShareLinksRepository],
  exports: [AssociationService],
})
export class SharelinksModule {}
