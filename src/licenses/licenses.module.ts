import { Module } from '@nestjs/common';
import {
  LicensesAdminController,
  LicensesSelfController,
} from './licenses.controller';
import { LicensesService } from './licenses.service';
import { PlatformAdminsModule } from '../platform-admins/platform-admins.module';

@Module({
  imports: [PlatformAdminsModule],
  controllers: [LicensesAdminController, LicensesSelfController],
  providers: [LicensesService],
  exports: [LicensesService],
})
export class LicensesModule {}
