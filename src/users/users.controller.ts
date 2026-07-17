import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MasterKeyGuard } from '../common/guards/master-key.guard';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

// Bootstraps the first cloud-native login (admin) for a business — no JWT
// exists yet at that point, so this is master-key gated like the
// businesses/devices admin endpoints. Day-to-day cashier creation goes
// through POST /users below instead.
@ApiTags('admin/users')
@ApiBearerAuth('bearer')
@UseGuards(MasterKeyGuard)
@Controller('admin/businesses/:businessId/users')
export class UsersAdminController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(
    @Param('businessId') businessId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.users.create(businessId, dto);
  }
}

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Lets an already-logged-in owner add cashiers from the app itself
  // without needing MASTER_API_KEY.
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Post()
  create(@Req() req: Request, @Body() dto: CreateUserDto) {
    return this.users.create(req.auth!.businessId, dto);
  }

  // Device-gated (not JWT) so the mobile app can list cashiers for a
  // login/user-picker screen before anyone has logged in yet.
  @UseGuards(DeviceAuthGuard)
  @Get()
  findAll(@Req() req: Request) {
    return this.users.findAllForBusiness(req.device!.businessId);
  }
}
