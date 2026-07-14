import { Module } from '@nestjs/common';
import {
  DevicesAdminController,
  DevicesSelfController,
} from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  controllers: [DevicesAdminController, DevicesSelfController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
