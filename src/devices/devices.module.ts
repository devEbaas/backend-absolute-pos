import { Module } from '@nestjs/common';
import {
  DevicesAdminController,
  DevicesPairingController,
  DevicesSelfController,
} from './devices.controller';
import { DevicesService } from './devices.service';
import { PlatformAdminsModule } from '../platform-admins/platform-admins.module';

@Module({
  imports: [PlatformAdminsModule],
  controllers: [
    DevicesAdminController,
    DevicesSelfController,
    DevicesPairingController,
  ],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
