import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { BusinessSettingsService } from './business-settings.service';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';

// Datos de empresa (para tickets y contacto) — pantalla "Configuración" del
// dashboard del dueño. Mismo guard combo que ReportsController/UsersController
// (JwtAuthGuard + AdminRoleGuard): solo el admin logueado de ese negocio.
@ApiTags('business-settings')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@Controller('business-settings')
export class BusinessSettingsController {
  constructor(private readonly businessSettings: BusinessSettingsService) {}

  @Get()
  findAll(@Req() req: Request) {
    return this.businessSettings.findAll(req.auth!.businessId);
  }

  @Put()
  update(@Req() req: Request, @Body() dto: UpdateBusinessSettingsDto) {
    return this.businessSettings.update(req.auth!.businessId, dto);
  }
}
