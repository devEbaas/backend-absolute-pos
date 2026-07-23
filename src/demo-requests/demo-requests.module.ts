import { Module } from '@nestjs/common';
import {
  DemoRequestsAdminController,
  DemoRequestsPublicController,
} from './demo-requests.controller';
import { DemoRequestsService } from './demo-requests.service';
import { PlatformAdminsModule } from '../platform-admins/platform-admins.module';

@Module({
  imports: [PlatformAdminsModule],
  controllers: [DemoRequestsPublicController, DemoRequestsAdminController],
  providers: [DemoRequestsService],
})
export class DemoRequestsModule {}
