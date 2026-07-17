import { Module } from '@nestjs/common';
import { UsersAdminController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersAdminController, UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
