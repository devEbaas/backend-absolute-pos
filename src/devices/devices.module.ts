import { Module } from '@nestjs/common';
import {
  DevicesAdminController,
  DevicesPairingController,
  DevicesSelfController,
} from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  controllers: [
    DevicesAdminController,
    DevicesSelfController,
    DevicesPairingController,
  ],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
