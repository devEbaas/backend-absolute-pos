import { Module } from '@nestjs/common';
import { UsersAdminController, UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PlatformAdminsModule } from '../platform-admins/platform-admins.module';

@Module({
  imports: [PlatformAdminsModule],
  controllers: [UsersAdminController, UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
