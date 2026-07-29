import { Module } from '@nestjs/common';
import { PlatformAdminsModule } from '../platform-admins/platform-admins.module';
import {
  OfflineLicensesAdminController,
  OfflineLicensesPublicController,
} from './offline-licenses.controller';
import { OfflineLicensesService } from './offline-licenses.service';

@Module({
  imports: [PlatformAdminsModule],
  controllers: [
    OfflineLicensesPublicController,
    OfflineLicensesAdminController,
  ],
  providers: [OfflineLicensesService],
})
export class OfflineLicensesModule {}
