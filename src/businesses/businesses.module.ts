import { Module } from '@nestjs/common';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { PlatformAdminsModule } from '../platform-admins/platform-admins.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PlatformAdminsModule, UsersModule],
  controllers: [BusinessesController],
  providers: [BusinessesService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
