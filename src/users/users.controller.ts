import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminAccessGuard } from '../common/guards/admin-access.guard';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { DeviceOrAdminGuard } from '../common/guards/device-or-admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ToggleUserActiveDto } from './dto/toggle-user-active.dto';

// Bootstraps the first cloud-native login (admin) for a business — no
// business JWT exists yet at that point, so this is gated by
// AdminAccessGuard (master key or platform-admin JWT), like the
// businesses/devices admin endpoints. Day-to-day cashier creation goes
// through POST /users below instead.
@ApiTags('admin/users')
@ApiBearerAuth('bearer')
@UseGuards(AdminAccessGuard)
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

  // Listado para la pestaña "Usuarios" de pos-root-dashboard — a diferencia
  // de UsersController.findAll (device-gated, para el picker mobile), este
  // sí expone email/phone/status.
  @Get()
  findAll(@Param('businessId') businessId: string) {
    return this.users.findAllForBusinessAdmin(businessId);
  }
}

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Lets a paired Electron install (device_api_key) create a cashier with a
  // real password directly in the cloud — see absolute-pos-app's
  // users.ipc.js, which now calls this before touching its local SQLite, so
  // the new user can log in from any other paired device right away instead
  // of arriving there as a passwordless sync "shadow" row. Also accepts an
  // already-logged-in owner's admin JWT (DeviceOrAdminGuard), for the
  // future case of adding cashiers from an app that isn't device-bound.
  @UseGuards(DeviceOrAdminGuard)
  @Post()
  create(@Req() req: Request, @Body() dto: CreateUserDto) {
    return this.users.create(req.businessId!, dto);
  }

  // Device-gated (not JWT) so the mobile app can list cashiers for a
  // login/user-picker screen before anyone has logged in yet.
  @UseGuards(DeviceAuthGuard)
  @Get()
  findAll(@Req() req: Request) {
    return this.users.findAllForBusiness(req.device!.businessId);
  }

  // Activar/desactivar cajero — pantalla "Usuarios" del dashboard del dueño
  // (ver docs/dashboard-cliente-design-brief.md §5.5). Gateado igual que
  // ReportsController (JwtAuthGuard+AdminRoleGuard) en vez de
  // DeviceOrAdminGuard: esta acción es de administración del negocio, no
  // algo que un Electron pareado dispare por su cuenta.
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Patch(':id/active')
  setActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ToggleUserActiveDto,
  ) {
    return this.users.setActive(req.auth!.businessId, id, dto.active);
  }
}
