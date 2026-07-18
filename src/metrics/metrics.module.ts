import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { PlatformAdminsModule } from '../platform-admins/platform-admins.module';

@Module({
  imports: [PlatformAdminsModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
